import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calcStats } from '../utils/battle'
import { initBattleChar, generateCpuTeam, runBattle } from '../utils/battleEngine'
import { loadDeckIds } from './DeckPage'
import type { BattleCharacter, BattleResult, Character, Job, Skill } from '../types'

const JOB_ICONS: Record<number, string> = { 1: '⚔️', 2: '🔮', 3: '👊', 4: '🏹' }

const CharCard = ({ char }: { char: BattleCharacter }) => (
  <div className={`bg-gray-700 rounded-lg flex flex-col items-center justify-center p-1 h-16 ${!char.isAlive ? 'opacity-40' : ''}`}>
    <span className="text-lg leading-none">{JOB_ICONS[char.jobId]}</span>
    <span className="text-[9px] font-medium truncate w-full text-center mt-0.5 leading-none px-0.5">{char.name}</span>
    {char.shield > 0 && <span className="text-[8px] text-blue-300 leading-none">🛡{char.shield}</span>}
    {char.statusEffects.length > 0 && (
      <div className="flex gap-0.5 flex-wrap justify-center">
        {char.statusEffects.map((e, i) => (
          <span key={i} className="text-[8px] leading-none">
            {e.type === 'poison' ? '☠' : e.type === 'paralysis' ? '⚡' : e.type === 'stun' ? '💫' : '↓'}
          </span>
        ))}
      </div>
    )}
  </div>
)

const CharHpBar = ({ char }: { char: BattleCharacter }) => {
  const pct = Math.max(0, (char.currentHp / char.maxHp) * 100)
  const color = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div>
      <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[9px] text-gray-400 text-center mt-0.5 leading-none tabular-nums">
        {Math.max(0, char.currentHp)}
      </div>
    </div>
  )
}

const BattlePage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const questState = location.state as { questId?: number; questTitle?: string; questLevel?: number; rewardExp?: number; rewardGold?: number } | null
  const [phase, setPhase] = useState<'loading' | 'empty' | 'fighting' | 'done'>('loading')
  const [myChars, setMyChars] = useState<(Character & { job: Job; skills: Skill[] })[]>([])
  const [charsLoaded, setCharsLoaded] = useState(false)
  const battleIds = useRef<string[]>([])
  const autoStarted = useRef(false)
  const timeoutIds = useRef<ReturnType<typeof setTimeout>[]>([])
  const [playerTeam, setPlayerTeam] = useState<BattleCharacter[]>([])
  const [cpuTeam, setCpuTeam] = useState<BattleCharacter[]>([])
  const [result, setResult] = useState<BattleResult | null>(null)
  const [currentLog, setCurrentLog] = useState<string>('')

  useEffect(() => {
    if (!user) return
    const fetch = async () => {
      const { data } = await supabase
        .from('characters')
        .select('*, job:jobs(*), skills:character_skills(skill:skills(*))')
        .eq('user_id', user.id)
      if (data) setMyChars(data.map(c => ({ ...c, skills: (c.skills as { skill: Skill }[]).map(s => s.skill) })))
      setCharsLoaded(true)
    }
    fetch()
  }, [user])

  // キャラ読み込み完了後、デッキを取得して自動バトル開始
  useEffect(() => {
    if (!charsLoaded || autoStarted.current) return
    autoStarted.current = true
    const ids = loadDeckIds()
    const validIds = ids.filter(id => myChars.some(c => c.id === id))
    if (validIds.length === 0) {
      setPhase('empty')
      return
    }
    startBattle(validIds)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charsLoaded])

  const startBattle = async (ids: string[]) => {
    battleIds.current = ids
    const { data: jobs } = await supabase.from('jobs').select('*')
    const { data: skills } = await supabase.from('skills').select('*')
    if (!jobs || !skills) return

    const avgLevel = questState?.questLevel ??
      Math.round(myChars.filter(c => ids.includes(c.id)).reduce((s, c) => s + c.level, 0) / ids.length)
    const pTeam = myChars.filter(c => ids.includes(c.id)).map(c =>
      initBattleChar(c.id, c.name, c.job_id, 'player', calcStats(c.job, c.level, [], { hp: c.iv_hp, atk: c.iv_atk, def: c.iv_def }), c.skills)
    )
    const cTeam = generateCpuTeam(avgLevel, jobs as Job[], skills as Skill[])

    setPlayerTeam(pTeam)
    setCpuTeam(cTeam)
    setPhase('fighting')

    const res = runBattle(pTeam.map(c => ({ ...c })), cTeam.map(c => ({ ...c })))
    setResult(res)

    timeoutIds.current = []
    let delay = 0
    res.logs.forEach((log, i) => {
      const isHeader = log.message.startsWith('===')
      delay += isHeader ? 400 : 1200
      const id = setTimeout(() => {
        setCurrentLog(log.message)
        setPlayerTeam(prev => prev.map(c => {
          const s = log.snapshot.find(x => x.id === c.id)
          return s ? { ...c, currentHp: s.currentHp, shield: s.shield, isAlive: s.isAlive, statusEffects: s.statusEffects } : c
        }))
        setCpuTeam(prev => prev.map(c => {
          const s = log.snapshot.find(x => x.id === c.id)
          return s ? { ...c, currentHp: s.currentHp, shield: s.shield, isAlive: s.isAlive, statusEffects: s.statusEffects } : c
        }))
        if (i === res.logs.length - 1) {
          setTimeout(() => setPhase('done'), 800)
        }
      }, delay)
      timeoutIds.current.push(id)
    })
  }

  const skipBattle = () => {
    if (!result) return
    timeoutIds.current.forEach(id => clearTimeout(id))
    timeoutIds.current = []
    setPlayerTeam(result.finalPlayerTeam)
    setCpuTeam(result.finalCpuTeam)
    setCurrentLog(result.logs[result.logs.length - 1]?.message ?? '')
    setPhase('done')
  }

  const applyRewards = async () => {
    if (!result || !user) return
    const expReward = questState?.rewardExp
      ? (result.winner === 'player' ? questState.rewardExp : result.winner === 'draw' ? Math.floor(questState.rewardExp * 0.3) : Math.floor(questState.rewardExp * 0.1))
      : (result.winner === 'player' ? 100 : result.winner === 'draw' ? 30 : 10)
    const goldReward = questState?.rewardGold
      ? (result.winner === 'player' ? questState.rewardGold : result.winner === 'draw' ? Math.floor(questState.rewardGold * 0.2) : 0)
      : (result.winner === 'player' ? 50 : result.winner === 'draw' ? 10 : 0)

    for (const char of myChars.filter(c => battleIds.current.includes(c.id))) {
      const newExp = char.exp + expReward
      const newLevel = newExp >= char.level * 100 && char.level < char.max_level ? char.level + 1 : char.level
      await supabase.from('characters').update({ exp: newLevel > char.level ? newExp - char.level * 100 : newExp, level: newLevel }).eq('id', char.id)
    }
    if (goldReward > 0) {
      const { data: u } = await supabase.from('users').select('gold').eq('id', user.id).single()
      await supabase.from('users').update({ gold: (u?.gold ?? 0) + goldReward }).eq('id', user.id)
    }
    if (questState?.questId && result.winner === 'player') {
      await supabase.from('user_quests').upsert({ user_id: user.id, quest_id: questState.questId, status: 'completed', cleared_at: new Date().toISOString() }, { onConflict: 'user_id,quest_id' })
    }
    navigate(questState?.questId ? '/quest' : '/')
  }

  // ===== 読み込み中 =====
  if (phase === 'loading') return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-purple-400">バトル準備中...</p>
    </div>
  )

  // ===== デッキ未設定 =====
  if (phase === 'empty') return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="text-5xl mb-2">🃏</div>
      <h2 className="text-xl font-bold">デッキが設定されていません</h2>
      <p className="text-gray-400 text-sm">バトルを始める前にデッキ編成でキャラを登録してください</p>
      <button onClick={() => navigate('/deck')} className="mt-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-xl transition-colors">
        デッキ編成へ
      </button>
      <button onClick={() => navigate(-1)} className="text-gray-400 text-sm underline">
        戻る
      </button>
    </div>
  )

  // ===== バトル画面（fighting / done） =====
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-2 relative flex items-center justify-center">
        <h1 className="font-bold">{questState?.questTitle ?? 'バトル'}</h1>
        {phase === 'fighting' && (
          <button onClick={skipBattle}
            className="absolute right-4 text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors">
            スキップ »
          </button>
        )}
      </header>

      <div className="px-3 pt-2 pb-1 space-y-1">
        <div className="text-xs text-red-400 text-center">敵</div>
        <div className="grid grid-cols-4 gap-1">
          {cpuTeam.map(c => <CharCard key={c.id} char={c} />)}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {cpuTeam.map(c => <CharHpBar key={c.id} char={c} />)}
        </div>
        <div className="text-xs text-blue-400 text-center pt-1">味方</div>
        <div className="grid grid-cols-4 gap-1">
          {playerTeam.map(c => <CharCard key={c.id} char={c} />)}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {playerTeam.map(c => <CharHpBar key={c.id} char={c} />)}
        </div>
      </div>

      <div className="flex-1" />

      <div className="mx-3 mb-2 bg-gray-950 border border-gray-800 rounded-xl px-5 py-4 min-h-[80px] flex items-center">
        <p className={`text-sm w-full ${
          currentLog.startsWith('===') ? 'text-yellow-400 font-bold text-center'
          : currentLog.includes('倒れた') ? 'text-red-400'
          : currentLog.includes('回復') ? 'text-green-400'
          : 'text-gray-200'
        }`}>{currentLog}</p>
      </div>

      {phase === 'done' && result && (
        <div className="px-4 pb-6">
          <div className={`text-center text-2xl font-bold mb-3 ${result.winner === 'player' ? 'text-yellow-400' : result.winner === 'draw' ? 'text-gray-400' : 'text-red-400'}`}>
            {result.winner === 'player' ? '🏆 勝利！' : result.winner === 'draw' ? '🤝 引き分け' : '💀 敗北'}
          </div>
          <div className="text-center text-sm text-gray-400 mb-4">
            {result.winner === 'player' ? 'EXP +100 / Gold +50' : result.winner === 'draw' ? 'EXP +30 / Gold +10' : 'EXP +10'}
          </div>
          <button onClick={applyRewards} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl">
            報酬を受け取る
          </button>
        </div>
      )}
    </div>
  )
}

export default BattlePage
