import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Equipment, Job, Skill } from '../types'

const SHOP_STORAGE_KEY = 'soulpalette_shop'

const JOB_ICONS: Record<number, string> = { 1: '⚔️', 2: '🔮', 3: '👊', 4: '🏹' }

const RARITY_PRICE: Record<string, number> = {
  common: 50,
  uncommon: 100,
  rare: 200,
  epic: 400,
  legendary: 800,
}

const RARITY_COLOR: Record<string, string> = {
  common: 'text-gray-300',
  uncommon: 'text-green-400',
  rare: 'text-blue-400',
  epic: 'text-purple-400',
  legendary: 'text-yellow-400',
}

const RARITY_LABEL: Record<string, string> = {
  common: 'コモン',
  uncommon: 'アンコモン',
  rare: 'レア',
  epic: 'エピック',
  legendary: 'レジェンダリー',
}

const EQ_TYPE_LABEL: Record<string, string> = {
  weapon: '武器',
  armor: '防具',
  accessory: 'アクセサリー',
}

const CHAR_NAMES = [
  'アッシュ', 'グレン', 'ライラ', 'セラ', 'リョウ', 'カン',
  'エルフィン', 'バルドル', 'シルル', 'ガルム', 'リーン',
  'フェラ', 'ジン', 'アルケ', 'マク', 'ヒナ', 'ライン', 'エルム',
  'テオ', 'ルナ', 'ゼラ', 'イオン', 'クレア', 'ベル',
]

const CHAR_PRICE = 300

type TabType = 'equipment' | 'character'

type ShopEquipItem = { equipmentId: number; price: number; sold: boolean }
type ShopCharItem = {
  jobId: number
  name: string
  iv_hp: number
  iv_atk: number
  iv_def: number
  skillIds: number[]
  price: number
  sold: boolean
}
type ShopData = { equipment: ShopEquipItem[]; characters: ShopCharItem[]; refreshedAt: string }

function buildShop(equipments: Equipment[], jobs: Job[], allSkills: Skill[]): ShopData {
  const shuffledEq = [...equipments].sort(() => Math.random() - 0.5).slice(0, 5)
  const equipment: ShopEquipItem[] = shuffledEq.map(eq => ({
    equipmentId: eq.id,
    price: RARITY_PRICE[eq.rarity] ?? 100,
    sold: false,
  }))

  const usedNames = new Set<string>()
  const characters: ShopCharItem[] = Array.from({ length: 3 }, () => {
    const job = jobs[Math.floor(Math.random() * jobs.length)]
    let name: string
    do {
      name = CHAR_NAMES[Math.floor(Math.random() * CHAR_NAMES.length)]
    } while (usedNames.has(name))
    usedNames.add(name)
    const jobSkills = allSkills.filter(s => s.job_id === job.id)
    const skillIds = [...jobSkills].sort(() => Math.random() - 0.5).slice(0, 4).map(s => s.id)
    return {
      jobId: job.id,
      name,
      iv_hp: Math.floor(Math.random() * 256),
      iv_atk: Math.floor(Math.random() * 256),
      iv_def: Math.floor(Math.random() * 256),
      skillIds,
      price: CHAR_PRICE,
      sold: false,
    }
  })

  return { equipment, characters, refreshedAt: new Date().toISOString() }
}

const ShopPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabType>('equipment')
  const [gold, setGold] = useState(0)
  const [equipments, setEquipments] = useState<Equipment[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [allSkills, setAllSkills] = useState<Skill[]>([])
  const [shopData, setShopData] = useState<ShopData | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const init = async () => {
      setLoading(true)
      setError(null)
      try {
        await supabase.from('users').upsert({ id: user.id }, { onConflict: 'id' })
        const [{ data: userData }, { data: eqData }, { data: jobData }, { data: skillData }] = await Promise.all([
          supabase.from('users').select('gold').eq('id', user.id).single(),
          supabase.from('equipments').select('*'),
          supabase.from('jobs').select('*').order('id'),
          supabase.from('skills').select('*'),
        ])
        const eqs = (eqData ?? []) as Equipment[]
        const jbs = (jobData ?? []) as Job[]
        const sks = (skillData ?? []) as Skill[]
        setGold(userData?.gold ?? 0)
        setEquipments(eqs)
        setJobs(jbs)
        setAllSkills(sks)

        const saved = localStorage.getItem(SHOP_STORAGE_KEY)
        if (saved) {
          setShopData(JSON.parse(saved) as ShopData)
        } else {
          const newShop = buildShop(eqs, jbs, sks)
          localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(newShop))
          setShopData(newShop)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'データ取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [user])

  const handleRefresh = () => {
    const newShop = buildShop(equipments, jobs, allSkills)
    localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(newShop))
    setShopData(newShop)
    setMessage('ラインナップを更新しました')
    setTimeout(() => setMessage(null), 2000)
  }

  const showError = (msg: string) => {
    setError(msg)
    setTimeout(() => setError(null), 2500)
  }

  const buyEquipment = async (item: ShopEquipItem) => {
    if (!user || !shopData || item.sold || buying) return
    if (gold < item.price) { showError('所持ゴールドが不足しています'); return }
    setBuying(`eq-${item.equipmentId}`)
    try {
      const { error: goldErr } = await supabase
        .from('users').update({ gold: gold - item.price }).eq('id', user.id)
      if (goldErr) throw goldErr
      const { error: uqErr } = await supabase
        .from('user_equipments').insert({ user_id: user.id, equipment_id: item.equipmentId })
      if (uqErr) throw uqErr

      setGold(g => g - item.price)
      const updated: ShopData = {
        ...shopData,
        equipment: shopData.equipment.map(e =>
          e.equipmentId === item.equipmentId ? { ...e, sold: true } : e
        ),
      }
      localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(updated))
      setShopData(updated)
      const eq = equipments.find(e => e.id === item.equipmentId)
      setMessage(`${eq?.name ?? '装備'} を入手しました！`)
      setTimeout(() => setMessage(null), 2500)
    } catch (err) {
      showError(err instanceof Error ? err.message : '購入に失敗しました')
    } finally {
      setBuying(null)
    }
  }

  const buyCharacter = async (item: ShopCharItem, index: number) => {
    if (!user || !shopData || item.sold || buying) return
    if (gold < item.price) { showError('所持ゴールドが不足しています'); return }
    setBuying(`char-${index}`)
    try {
      const { error: goldErr } = await supabase
        .from('users').update({ gold: gold - item.price }).eq('id', user.id)
      if (goldErr) throw goldErr

      const { data: character, error: charErr } = await supabase
        .from('characters')
        .insert({ user_id: user.id, name: item.name, job_id: item.jobId, iv_hp: item.iv_hp, iv_atk: item.iv_atk, iv_def: item.iv_def })
        .select().single()
      if (charErr) throw charErr

      const { error: csErr } = await supabase.from('character_skills').insert(
        item.skillIds.map((skillId, slot) => ({ character_id: character.id, skill_id: skillId, slot: slot + 1 }))
      )
      if (csErr) throw csErr

      setGold(g => g - item.price)
      const updated: ShopData = {
        ...shopData,
        characters: shopData.characters.map((c, i) => i === index ? { ...c, sold: true } : c),
      }
      localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(updated))
      setShopData(updated)
      setMessage(`${item.name} を仲間にしました！`)
      setTimeout(() => setMessage(null), 2500)
    } catch (err) {
      showError(err instanceof Error ? err.message : '購入に失敗しました')
    } finally {
      setBuying(null)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-purple-400">読み込み中...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white text-lg">←</button>
        <h1 className="text-lg font-bold flex-1">ショップ</h1>
        <span className="text-sm text-amber-400 bg-gray-700 px-3 py-1 rounded-lg">
          💰 {gold.toLocaleString()}G
        </span>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {message && (
          <div className="p-3 bg-green-900/50 border border-green-500 rounded-lg text-green-300 text-sm text-center">
            {message}
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        {/* タブ + 更新ボタン */}
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-800 rounded-lg p-1 flex-1">
            {(['equipment', 'character'] as TabType[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === t ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t === 'equipment' ? '🛡️ 装備' : '👤 キャラ'}
              </button>
            ))}
          </div>
          <button
            onClick={handleRefresh}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
          >
            🔄 更新
          </button>
        </div>

        {shopData && (
          <>
            <p className="text-xs text-gray-500 text-right">
              更新: {new Date(shopData.refreshedAt).toLocaleString('ja-JP')}
            </p>

            {/* 装備タブ */}
            {tab === 'equipment' && (
              <div className="space-y-3">
                {shopData.equipment.map(item => {
                  const eq = equipments.find(e => e.id === item.equipmentId)
                  if (!eq) return null
                  return (
                    <div
                      key={item.equipmentId}
                      className={`bg-gray-800 border rounded-xl p-4 ${item.sold ? 'opacity-40 border-gray-700' : 'border-gray-600'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{eq.name}</span>
                            <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
                              {EQ_TYPE_LABEL[eq.type] ?? eq.type}
                            </span>
                            <span className={`text-xs ${RARITY_COLOR[eq.rarity] ?? 'text-gray-400'}`}>
                              {RARITY_LABEL[eq.rarity] ?? eq.rarity}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs">
                            {eq.hp_bonus !== 0 && <span className="text-red-400">HP+{eq.hp_bonus}</span>}
                            {eq.atk_bonus !== 0 && <span className="text-orange-400">ATK+{eq.atk_bonus}</span>}
                            {eq.def_bonus !== 0 && <span className="text-blue-400">DEF+{eq.def_bonus}</span>}
                            {eq.spd_bonus !== 0 && <span className="text-green-400">SPD+{eq.spd_bonus}</span>}
                          </div>
                          {eq.description && (
                            <p className="mt-1 text-xs text-gray-400">{eq.description}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-amber-400 font-bold text-sm mb-2">{item.price}G</div>
                          {item.sold ? (
                            <span className="text-xs text-gray-500">売り切れ</span>
                          ) : (
                            <button
                              onClick={() => buyEquipment(item)}
                              disabled={!!buying || gold < item.price}
                              className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {buying === `eq-${item.equipmentId}` ? '...' : '購入'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* キャラタブ */}
            {tab === 'character' && (
              <div className="space-y-3">
                {shopData.characters.map((item, index) => {
                  const job = jobs.find(j => j.id === item.jobId)
                  const skills = item.skillIds
                    .map(id => allSkills.find(s => s.id === id))
                    .filter((s): s is Skill => s !== undefined)
                  const ivColor = `rgb(${item.iv_atk}, ${item.iv_hp}, ${item.iv_def})`
                  return (
                    <div
                      key={index}
                      className={`bg-gray-800 border-2 rounded-xl p-4 ${item.sold ? 'opacity-40 border-gray-700' : ''}`}
                      style={!item.sold ? { borderColor: ivColor } : undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{JOB_ICONS[item.jobId] ?? '?'}</span>
                            <span className="font-bold">{item.name}</span>
                            <span className="text-xs text-gray-400">{job?.name}</span>
                          </div>
                          <div className="mt-1 text-xs font-mono" style={{ color: ivColor }}>
                            IV({item.iv_atk}/{item.iv_hp}/{item.iv_def})
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {skills.map(skill => (
                              <span key={skill.id} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                                {skill.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-amber-400 font-bold text-sm mb-2">{item.price}G</div>
                          {item.sold ? (
                            <span className="text-xs text-gray-500">売り切れ</span>
                          ) : (
                            <button
                              onClick={() => buyCharacter(item, index)}
                              disabled={!!buying || gold < item.price}
                              className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {buying === `char-${index}` ? '...' : '仲間にする'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default ShopPage
