import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { UserEquipment, Character, Job } from '../types'

type TabType = 'weapon' | 'armor' | 'accessory'
const TAB_LABELS: Record<TabType, string> = { weapon: '武器', armor: '防具', accessory: 'アクセサリー' }
const RARITY_COLOR: Record<string, string> = {
  common: 'text-gray-400', rare: 'text-blue-400', epic: 'text-purple-400',
}
const RARITY_LABEL: Record<string, string> = {
  common: 'コモン', rare: 'レア', epic: 'エピック',
}

type EquippedInfo = { characterName: string; characterId: string; ceId: string }

const EquipmentPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [ownedEquips, setOwnedEquips] = useState<UserEquipment[]>([])
  const [characters, setCharacters] = useState<(Character & { job: Job })[]>([])
  const [equippedMap, setEquippedMap] = useState<Record<string, EquippedInfo>>({})
  const [activeTab, setActiveTab] = useState<TabType>('weapon')
  const [selected, setSelected] = useState<UserEquipment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = async () => {
    if (!user) return
    setLoading(true)
    try {
      // 所持装備
      const { data: equips, error: e1 } = await supabase
        .from('user_equipments')
        .select('*, equipment:equipments(*)')
        .eq('user_id', user.id)
      if (e1) throw e1

      // キャラクター
      const { data: chars, error: e2 } = await supabase
        .from('characters')
        .select('*, job:jobs(*)')
        .eq('user_id', user.id)
      if (e2) throw e2

      // 装備中情報
      const { data: ces, error: e3 } = await supabase
        .from('character_equipments')
        .select('*, character:characters(id, name)')
        .in('character_id', (chars ?? []).map((c) => c.id))
      if (e3) throw e3

      const map: Record<string, EquippedInfo> = {}
      for (const ce of ces ?? []) {
        map[ce.user_equipment_id] = {
          characterName: ce.character.name,
          characterId: ce.character.id,
          ceId: ce.id,
        }
      }

      setOwnedEquips(equips ?? [])
      setCharacters(chars ?? [])
      setEquippedMap(map)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データ取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [user])

  // 装備する
  const handleEquip = async (characterId: string) => {
    if (!selected) return
    const slot = selected.equipment!.type
    try {
      // 対象キャラのそのスロットに既存装備があれば外す
      const { data: existing } = await supabase
        .from('character_equipments')
        .select('id')
        .eq('character_id', characterId)
        .eq('slot', slot)
        .maybeSingle()
      if (existing) {
        await supabase.from('character_equipments').delete().eq('id', existing.id)
      }
      // 選択装備が他キャラに装備されていれば外す
      const info = equippedMap[selected.id]
      if (info) {
        await supabase.from('character_equipments').delete().eq('id', info.ceId)
      }
      // 装備する
      await supabase.from('character_equipments').insert({
        character_id: characterId,
        user_equipment_id: selected.id,
        slot,
      })
      setSelected(null)
      fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '装備に失敗しました')
    }
  }

  // 外す
  const handleUnequip = async () => {
    if (!selected) return
    const info = equippedMap[selected.id]
    if (!info) return
    try {
      await supabase.from('character_equipments').delete().eq('id', info.ceId)
      setSelected(null)
      fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '外すのに失敗しました')
    }
  }

  // テスト用：全装備を1個ずつ入手
  const handleGetTestEquips = async () => {
    if (!user) return
    const { data: all } = await supabase.from('equipments').select('id')
    if (!all) return
    await supabase.from('user_equipments').insert(all.map((e) => ({ user_id: user.id, equipment_id: e.id })))
    fetchAll()
  }

  const filtered = ownedEquips.filter((ue) => ue.equipment?.type === activeTab)

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white">←</button>
        <h1 className="text-lg font-bold">装備</h1>
      </header>

      {/* タブ */}
      <div className="flex bg-gray-800 border-b border-gray-700">
        {(Object.keys(TAB_LABELS) as TabType[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === tab ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400'}`}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto px-4 py-4">
        {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">{TAB_LABELS[activeTab]}がありません</p>
            <button onClick={handleGetTestEquips} className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg">
              テスト用装備を入手
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((ue) => {
              const e = ue.equipment!
              const info = equippedMap[ue.id]
              return (
                <button key={ue.id} onClick={() => setSelected(ue)}
                  className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-4 text-left transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-bold mr-2">{e.name}</span>
                      <span className={`text-xs ${RARITY_COLOR[e.rarity]}`}>{RARITY_LABEL[e.rarity]}</span>
                    </div>
                    {info && <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full">{info.characterName}</span>}
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400">
                    {e.atk_bonus > 0 && <span className="text-orange-400">ATK+{e.atk_bonus}</span>}
                    {e.def_bonus > 0 && <span className="text-blue-400">DEF+{e.def_bonus}</span>}
                    {e.hp_bonus  > 0 && <span className="text-red-400">HP+{e.hp_bonus}</span>}
                    {e.spd_bonus > 0 && <span className="text-green-400">SPD+{e.spd_bonus}</span>}
                  </div>
                </button>
              )
            })}
            <button onClick={handleGetTestEquips} className="w-full bg-gray-800 hover:bg-gray-700 border border-dashed border-gray-600 rounded-xl p-3 text-sm text-gray-500">
              + テスト用装備を入手
            </button>
          </div>
        )}
      </main>

      {/* 装備モーダル */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
          onClick={() => setSelected(null)}>
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-1">{selected.equipment?.name}</h2>
            <p className="text-sm text-gray-400 mb-4">装備するキャラを選んでください</p>

            <div className="space-y-2 mb-4">
              {characters.map((char) => (
                <button key={char.id} onClick={() => handleEquip(char.id)}
                  className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-3 text-left transition-colors">
                  <span className="font-medium">{char.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{char.job.name} Lv.{char.level}</span>
                </button>
              ))}
            </div>

            {equippedMap[selected.id] && (
              <button onClick={handleUnequip} className="w-full bg-red-900/50 hover:bg-red-900 border border-red-700 text-red-300 py-2 rounded-lg text-sm mb-2 transition-colors">
                外す（{equippedMap[selected.id].characterName}から）
              </button>
            )}
            <button onClick={() => setSelected(null)} className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors">
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default EquipmentPage
