import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { UserEquipment, Character, Job } from '../types'

type TabType = 'weapon' | 'armor' | 'accessory'
const TAB_LABELS: Record<TabType, string> = { weapon: '武器', armor: '防具', accessory: 'アクセサリー' }
const RARITY_COLOR: Record<string, string> = {
  common: 'text-gray-400', uncommon: 'text-green-400', rare: 'text-blue-400', epic: 'text-purple-400', legendary: 'text-yellow-400',
}
const RARITY_LABEL: Record<string, string> = {
  common: 'コモン', uncommon: 'アンコモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンダリー',
}
// 売却価格（ショップ買値の半額）
const RARITY_SELL: Record<string, number> = {
  common: 25, uncommon: 50, rare: 100, epic: 200, legendary: 400,
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
  const [sellMode, setSellMode] = useState(false)
  const [sellSelectedIds, setSellSelectedIds] = useState<Set<string>>(new Set())
  const [selling, setSelling] = useState(false)

  const fetchAll = async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data: equips, error: e1 } = await supabase
        .from('user_equipments').select('*, equipment:equipments(*)').eq('user_id', user.id)
      if (e1) throw e1
      const { data: chars, error: e2 } = await supabase
        .from('characters').select('*, job:jobs(*)').eq('user_id', user.id)
      if (e2) throw e2
      const { data: ces, error: e3 } = await supabase
        .from('character_equipments').select('*, character:characters(id, name)')
        .in('character_id', (chars ?? []).map((c) => c.id))
      if (e3) throw e3

      const map: Record<string, EquippedInfo> = {}
      for (const ce of ces ?? []) {
        map[ce.user_equipment_id] = { characterName: ce.character.name, characterId: ce.character.id, ceId: ce.id }
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

  const handleEquip = async (characterId: string) => {
    if (!selected) return
    const slot = selected.equipment!.type
    try {
      const { data: existing } = await supabase
        .from('character_equipments').select('id').eq('character_id', characterId).eq('slot', slot).maybeSingle()
      if (existing) await supabase.from('character_equipments').delete().eq('id', existing.id)
      const info = equippedMap[selected.id]
      if (info) await supabase.from('character_equipments').delete().eq('id', info.ceId)
      await supabase.from('character_equipments').insert({ character_id: characterId, user_equipment_id: selected.id, slot })
      setSelected(null)
      fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '装備に失敗しました')
    }
  }

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

  const handleGetTestEquips = async () => {
    if (!user) return
    const { data: all } = await supabase.from('equipments').select('id')
    if (!all) return
    await supabase.from('user_equipments').insert(all.map((e) => ({ user_id: user.id, equipment_id: e.id })))
    fetchAll()
  }

  const toggleSellSelect = (id: string) => {
    setSellSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = ownedEquips.filter((ue) => ue.equipment?.type === activeTab)

  const totalSellGold = [...sellSelectedIds].reduce((sum, id) => {
    const ue = ownedEquips.find(e => e.id === id)
    return sum + (RARITY_SELL[ue?.equipment?.rarity ?? ''] ?? 25)
  }, 0)

  const handleSell = async () => {
    if (!user || sellSelectedIds.size === 0 || selling) return
    setSelling(true)
    setError(null)
    try {
      const ids = [...sellSelectedIds]
      // 装備中なら外す
      await supabase.from('character_equipments').delete().in('user_equipment_id', ids)
      // 所持装備を削除
      await supabase.from('user_equipments').delete().in('id', ids)
      // Gold付与
      const { data: u } = await supabase.from('users').select('gold').eq('id', user.id).single()
      await supabase.from('users').update({ gold: (u?.gold ?? 0) + totalSellGold }).eq('id', user.id)
      setSellSelectedIds(new Set())
      setSellMode(false)
      fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '売却に失敗しました')
    } finally {
      setSelling(false)
    }
  }

  const exitSellMode = () => {
    setSellMode(false)
    setSellSelectedIds(new Set())
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (sellMode) exitSellMode(); else navigate('/') }}
            className="text-gray-400 hover:text-white">←</button>
          <h1 className="text-lg font-bold">装備</h1>
        </div>
        {sellMode ? (
          <button onClick={exitSellMode}
            className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
            キャンセル
          </button>
        ) : (
          <button onClick={() => setSellMode(true)}
            className="text-sm bg-gray-700 hover:bg-gray-600 text-amber-400 px-3 py-1.5 rounded-lg transition-colors">
            売却
          </button>
        )}
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

      <main className="max-w-lg mx-auto px-4 py-4 pb-32">
        {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">{error}</div>}

        {sellMode && (
          <p className="text-xs text-amber-400/80 mb-3">売却する装備を選んでください（複数選択可）</p>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">{TAB_LABELS[activeTab]}がありません</p>
            {!sellMode && (
              <button onClick={handleGetTestEquips} className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg">
                テスト用装備を入手
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((ue) => {
              const e = ue.equipment!
              const info = equippedMap[ue.id]
              const isSelected = sellSelectedIds.has(ue.id)
              const price = RARITY_SELL[e.rarity] ?? 25
              return (
                <button key={ue.id}
                  onClick={() => sellMode ? toggleSellSelect(ue.id) : setSelected(ue)}
                  className={`w-full bg-gray-800 border rounded-xl p-4 text-left transition-colors relative ${
                    sellMode
                      ? isSelected
                        ? 'border-amber-400 bg-amber-900/20'
                        : 'border-gray-700 hover:bg-gray-700'
                      : 'border-gray-700 hover:bg-gray-700'
                  }`}>
                  {/* 売却モード: チェックマーク */}
                  {sellMode && (
                    <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? 'bg-amber-400 border-amber-400' : 'border-gray-500'
                    }`}>
                      {isSelected && <span className="text-gray-900 text-xs font-bold">✓</span>}
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-2 pr-7">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{e.name}</span>
                      <span className={`text-xs ${RARITY_COLOR[e.rarity] ?? 'text-gray-400'}`}>
                        {RARITY_LABEL[e.rarity] ?? e.rarity}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {info && !sellMode && (
                        <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full">{info.characterName}</span>
                      )}
                      {sellMode && (
                        <span className="text-amber-400 text-sm font-bold">{price}G</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400">
                    {e.atk_bonus > 0 && <span className="text-orange-400">ATK+{e.atk_bonus}</span>}
                    {e.def_bonus > 0 && <span className="text-blue-400">DEF+{e.def_bonus}</span>}
                    {e.hp_bonus  > 0 && <span className="text-red-400">HP+{e.hp_bonus}</span>}
                    {e.spd_bonus > 0 && <span className="text-green-400">SPD+{e.spd_bonus}</span>}
                    {info && sellMode && (
                      <span className="text-gray-500 ml-auto">{info.characterName}に装備中</span>
                    )}
                  </div>
                </button>
              )
            })}
            {!sellMode && (
              <button onClick={handleGetTestEquips} className="w-full bg-gray-800 hover:bg-gray-700 border border-dashed border-gray-600 rounded-xl p-3 text-sm text-gray-500">
                + テスト用装備を入手
              </button>
            )}
          </div>
        )}
      </main>

      {/* 売却モード: 固定フッター */}
      {sellMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 px-4 py-4 z-40">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <div className="flex-1 text-sm text-gray-300">
              <span className="text-white font-bold">{sellSelectedIds.size}</span>件選択中
              {sellSelectedIds.size > 0 && (
                <span className="ml-2 text-amber-400 font-bold">合計 {totalSellGold}G</span>
              )}
            </div>
            <button
              onClick={handleSell}
              disabled={sellSelectedIds.size === 0 || selling}
              className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
            >
              {selling ? '売却中...' : '売却する'}
            </button>
          </div>
        </div>
      )}

      {/* 装備モーダル */}
      {selected && !sellMode && (
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
