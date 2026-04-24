import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { loadDeckIds } from './DeckPage'
import AdventureBattle from '../components/AdventureBattle'
import type { Character, Equipment, Job, Skill } from '../types'

const JOB_ICONS: Record<number, string> = { 1: '⚔️', 2: '🔮', 3: '👊', 4: '🏹' }
const ivColor = (c: { iv_atk: number; iv_hp: number; iv_def: number }) =>
  `rgb(${c.iv_atk}, ${c.iv_hp}, ${c.iv_def})`
const EQUIP_TYPE_LABELS: Record<string, string> = { weapon: '武器', armor: '防具', accessory: 'アクセサリー' }

type CharWithJob = Character & { job: Job; skills: Skill[] }
type EventType = 'battle' | 'gold' | 'equipment' | 'character'
type Phase = 'loading' | 'no_deck' | 'ready' | 'event' | 'battling' | 'gameover'

const pickEvent = (): EventType => {
  const r = Math.random()
  if (r < 0.40) return 'battle'
  if (r < 0.70) return 'gold'
  if (r < 0.90) return 'equipment'
  return 'character'
}

const AdventurePage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('loading')
  const [deckChars, setDeckChars] = useState<CharWithJob[]>([])
  const [stepCount, setStepCount] = useState(0)
  const [battleKey, setBattleKey] = useState(0)
  const [eventType, setEventType] = useState<EventType | null>(null)
  const [goldGained, setGoldGained] = useState(0)
  const [gainedEquip, setGainedEquip] = useState<Equipment | null>(null)
  const [gainedChar, setGainedChar] = useState<CharWithJob | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const ids = loadDeckIds()
      if (ids.length === 0) { setPhase('no_deck'); return }
      const { data } = await supabase
        .from('characters')
        .select('*, job:jobs(*), skills:character_skills(skill:skills(*))')
        .in('id', ids)
        .eq('user_id', user.id)
      if (!data || data.length === 0) { setPhase('no_deck'); return }
      const chars = data.map(c => ({
        ...c, skills: (c.skills as { skill: Skill }[]).map(s => s.skill),
      })) as CharWithJob[]
      setDeckChars(chars)
      setPhase('ready')
    }
    load()
  }, [user])

  const avgLevel = deckChars.length > 0
    ? Math.round(deckChars.reduce((s, c) => s + c.level, 0) / deckChars.length) : 1
  const minLevel = deckChars.length > 0 ? Math.min(...deckChars.map(c => c.level)) : 1

  const advance = async () => {
    if (processing) return
    setProcessing(true)
    const type = pickEvent()
    setEventType(type)
    setStepCount(prev => prev + 1)

    if (type === 'battle') {

      setBattleKey(k => k + 1)
      setPhase('battling')
      setProcessing(false)
      return
    }

    if (type === 'gold') {
      const amount = Math.floor(Math.random() * 171) + 30
      const { data: u } = await supabase.from('users').select('gold').eq('id', user!.id).single()
      await supabase.from('users').update({ gold: (u?.gold ?? 0) + amount }).eq('id', user!.id)
      setGoldGained(amount)
    } else if (type === 'equipment') {
      const { data: equips } = await supabase.from('equipments').select('*')
      if (equips && equips.length > 0) {
        const equip = equips[Math.floor(Math.random() * equips.length)] as Equipment
        await supabase.from('user_equipments').insert({ user_id: user!.id, equipment_id: equip.id })
        setGainedEquip(equip)
      } else {
        // 装備データがない場合はゴールドで代替
        const amount = 50
        const { data: u } = await supabase.from('users').select('gold').eq('id', user!.id).single()
        await supabase.from('users').update({ gold: (u?.gold ?? 0) + amount }).eq('id', user!.id)
        setGoldGained(amount)
        setEventType('gold')
      }
    } else if (type === 'character') {
      const { data: jobs } = await supabase.from('jobs').select('*')
      const { data: allSkills } = await supabase.from('skills').select('*')
      if (jobs && allSkills) {
        const job = (jobs as Job[])[Math.floor(Math.random() * jobs.length)]
        const iv_hp = Math.floor(Math.random() * 256)
        const iv_atk = Math.floor(Math.random() * 256)
        const iv_def = Math.floor(Math.random() * 256)
        const level = Math.floor(Math.random() * minLevel) + 1
        const { data: char, error } = await supabase
          .from('characters')
          .insert({ user_id: user!.id, name: `はぐれ${job.name}`, job_id: job.id, iv_hp, iv_atk, iv_def, level, exp: 0 })
          .select()
          .single()
        if (!error && char) {
          const jobSkills = (allSkills as Skill[]).filter(s => s.job_id === job.id)
          const selected = jobSkills.sort(() => Math.random() - 0.5).slice(0, 4)
          await supabase.from('character_skills').insert(
            selected.map((s, i) => ({ character_id: char.id, skill_id: s.id, slot: i + 1 }))
          )
          setGainedChar({ ...(char as Character), job, skills: selected })
        }
      }
    }

    setPhase('event')
    setProcessing(false)
  }

  const restart = () => {
    setStepCount(0)
    setEventType(null)
    setGoldGained(0)
    setGainedEquip(null)
    setGainedChar(null)
    setPhase('ready')
  }

  // ===== ローディング =====
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-purple-400">読み込み中...</p>
      </div>
    )
  }

  // ===== デッキ未設定 =====
  if (phase === 'no_deck') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-5xl mb-2">🃏</div>
        <h2 className="text-xl font-bold">デッキが設定されていません</h2>
        <p className="text-gray-400 text-sm">冒険を始める前にデッキ編成でキャラを登録してください</p>
        <button onClick={() => navigate('/deck')}
          className="mt-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-xl transition-colors">
          デッキ編成へ
        </button>
        <button onClick={() => navigate('/')} className="text-gray-400 text-sm underline">ホームへ</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white">←</button>
        <h1 className="text-lg font-bold">冒険</h1>
        <span className="ml-auto text-xs text-gray-500">{stepCount}歩</span>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 w-full flex-1 flex flex-col">

        {/* ===== ゲームオーバー ===== */}
        {phase === 'gameover' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <div className="text-6xl">💀</div>
            <h2 className="text-2xl font-bold">冒険終了</h2>
            <p className="text-gray-400">{stepCount}歩 進みました</p>
            <div className="flex flex-col gap-2 w-full mt-4">
              <button onClick={restart}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-colors">
                もう一度冒険する
              </button>
              <button onClick={() => navigate('/')}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl transition-colors">
                ホームへ
              </button>
            </div>
          </div>
        )}

        {/* ===== バトルイベント ===== */}
        {phase === 'battling' && (
          <div className="space-y-3">
            <p className="text-center text-sm text-red-400 font-bold">⚔️ バトル発生！</p>
            <AdventureBattle
              key={battleKey}
              playerChars={deckChars}
              avgLevel={avgLevel}
              onContinue={() => setPhase('ready')}
              onGameOver={() => setPhase('gameover')}
            />
          </div>
        )}

        {/* ===== イベント結果 ===== */}
        {phase === 'event' && (
          <div className="space-y-4">
            {eventType === 'gold' && (
              <div className="bg-gray-800 border border-yellow-700 rounded-2xl p-6 text-center space-y-2">
                <div className="text-5xl">💰</div>
                <p className="text-sm text-gray-400">ゴールドを発見！</p>
                <p className="text-3xl font-bold text-amber-400">+{goldGained}G</p>
              </div>
            )}

            {eventType === 'equipment' && gainedEquip && (
              <div className="bg-gray-800 border border-purple-700 rounded-2xl p-5 space-y-3">
                <div className="text-center">
                  <div className="text-4xl mb-2">🎁</div>
                  <p className="text-sm text-gray-400">装備を入手！</p>
                  <p className="text-xl font-bold mt-1">{gainedEquip.name}</p>
                  <span className="text-xs bg-gray-700 px-2 py-0.5 rounded-full text-gray-300">
                    {EQUIP_TYPE_LABELS[gainedEquip.type]} · {gainedEquip.rarity}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-center">
                  {gainedEquip.hp_bonus > 0 && <div className="bg-gray-700 rounded-lg py-1.5"><span className="text-red-400">HP</span> +{gainedEquip.hp_bonus}</div>}
                  {gainedEquip.atk_bonus > 0 && <div className="bg-gray-700 rounded-lg py-1.5"><span className="text-orange-400">ATK</span> +{gainedEquip.atk_bonus}</div>}
                  {gainedEquip.def_bonus > 0 && <div className="bg-gray-700 rounded-lg py-1.5"><span className="text-blue-400">DEF</span> +{gainedEquip.def_bonus}</div>}
                  {gainedEquip.spd_bonus > 0 && <div className="bg-gray-700 rounded-lg py-1.5"><span className="text-green-400">SPD</span> +{gainedEquip.spd_bonus}</div>}
                </div>
              </div>
            )}

            {eventType === 'character' && gainedChar && (
              <div className="bg-gray-800 border-2 rounded-2xl p-5 space-y-3"
                style={{ borderColor: ivColor(gainedChar) }}>
                <div className="text-center">
                  <div className="text-4xl mb-1">{JOB_ICONS[gainedChar.job_id]}</div>
                  <p className="text-sm text-gray-400 mb-1">仲間になりたそうにこちらを見ている！</p>
                  <p className="text-xl font-bold">{gainedChar.name}</p>
                  <p className="text-sm text-gray-400">{gainedChar.job.name} · Lv.{gainedChar.level}</p>
                </div>
                <div className="flex gap-2 text-xs justify-center flex-wrap">
                  <span style={{ color: `rgb(${gainedChar.iv_atk},80,80)` }}>ATK個体値 {gainedChar.iv_atk}</span>
                  <span style={{ color: `rgb(80,${gainedChar.iv_hp},80)` }}>HP個体値 {gainedChar.iv_hp}</span>
                  <span style={{ color: `rgb(80,80,${gainedChar.iv_def})` }}>DEF個体値 {gainedChar.iv_def}</span>
                </div>
                <div className="space-y-1">
                  {gainedChar.skills.map(s => (
                    <div key={s.id} className="bg-gray-700 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2">
                      <span className="text-gray-400">{s.type}</span>
                      <span className="font-medium">{s.name}</span>
                      {s.power > 0 && <span className="text-gray-500 ml-auto">威力{s.power}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => setPhase('ready')}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors">
              進む →
            </button>
          </div>
        )}

        {/* ===== 待機（進むボタン） ===== */}
        {phase === 'ready' && (
          <div className="flex-1 flex flex-col justify-between">
            <div className="space-y-1.5">
              {deckChars.map(c => (
                <div key={c.id}
                  className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 border"
                  style={{ borderColor: ivColor(c) }}>
                  <span className="text-sm">{JOB_ICONS[c.job_id]}</span>
                  <span className="text-sm font-medium truncate">{c.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">Lv.{c.level}</span>
                </div>
              ))}
            </div>
            <button
              onClick={advance}
              disabled={processing}
              className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-5 rounded-2xl text-lg transition-colors"
            >
              {processing ? '...' : '進む →'}
            </button>
          </div>
        )}

      </main>
    </div>
  )
}

export default AdventurePage
