import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calcStats } from '../utils/battle'
import { initBattleChar, generateCpuTeam, runBattle } from '../utils/battleEngine'
import type { BattleCharacter, BattleLogEntry, BattleResult, Character, Job, Skill } from '../types'

const JOB_ICONS: Record<number, string> = { 1: '⚔️', 2: '🔮', 3: '👊', 4: '🏹' }
const SPEEDS = [0.5, 1, 2, 3] as const
const SPEED_KEY = 'soulpalette_battle_speed'
const loadSpeed = (): number => {
  const v = parseFloat(localStorage.getItem(SPEED_KEY) ?? '')
  return SPEEDS.includes(v as typeof SPEEDS[number]) ? v : 1
}

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

type Props = {
  playerChars: (Character & { job: Job; skills: Skill[] })[]
  avgLevel: number
  initialHp?: Record<string, number>
  autoMode?: boolean
  onContinue: (finalHp: Record<string, number>) => void
  onGameOver: () => void
}

const AdventureBattle = ({ playerChars, avgLevel, initialHp, autoMode, onContinue, onGameOver }: Props) => {
  const { user } = useAuth()
  const [playerTeam, setPlayerTeam] = useState<BattleCharacter[]>([])
  const [cpuTeam, setCpuTeam] = useState<BattleCharacter[]>([])
  const [currentLog, setCurrentLog] = useState<string>('')
  const [battlePhase, setBattlePhase] = useState<'loading' | 'fighting' | 'done'>('loading')
  const [winner, setWinner] = useState<'player' | 'cpu' | 'draw' | null>(null)
  const [rewardExp, setRewardExp] = useState(0)
  const [rewardGold, setRewardGold] = useState(0)
  const [speed, setSpeed] = useState<number>(loadSpeed)

  const started = useRef(false)
  const timeoutIds = useRef<ReturnType<typeof setTimeout>[]>([])
  const battleResult = useRef<BattleResult | null>(null)
  const logsRef = useRef<BattleLogEntry[]>([])
  const currentLogIndexRef = useRef(-1)
  const speedRef = useRef(loadSpeed())
  const battlePhaseRef = useRef<'loading' | 'fighting' | 'done'>('loading')

  useEffect(() => { battlePhaseRef.current = battlePhase }, [battlePhase])

  const applySnapshot = (logs: BattleLogEntry[], idx: number) => {
    const snap = logs[idx].snapshot
    const apply = (prev: BattleCharacter[]) =>
      prev.map(c => {
        const s = snap.find(x => x.id === c.id)
        return s ? { ...c, currentHp: s.currentHp, shield: s.shield, isAlive: s.isAlive, statusEffects: s.statusEffects } : c
      })
    setPlayerTeam(apply)
    setCpuTeam(apply)
  }

  const scheduleFrom = (startIdx: number) => {
    timeoutIds.current.forEach(id => clearTimeout(id))
    timeoutIds.current = []
    const logs = logsRef.current
    const spd = speedRef.current
    let delay = 0
    for (let i = startIdx; i < logs.length; i++) {
      delay += Math.round((logs[i].message.startsWith('===') ? 400 : 1200) / spd)
      const idx = i
      const id = setTimeout(() => {
        currentLogIndexRef.current = idx
        setCurrentLog(logs[idx].message)
        applySnapshot(logs, idx)
        if (idx === logs.length - 1) {
          const doneId = setTimeout(() => setBattlePhase('done'), Math.round(800 / speedRef.current))
          timeoutIds.current.push(doneId)
        }
      }, delay)
      timeoutIds.current.push(id)
    }
  }

  const changeSpeed = (newSpeed: number) => {
    speedRef.current = newSpeed
    setSpeed(newSpeed)
    localStorage.setItem(SPEED_KEY, String(newSpeed))
    if (battlePhaseRef.current === 'fighting') {
      scheduleFrom(currentLogIndexRef.current + 1)
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true

    const run = async () => {
      const { data: jobs } = await supabase.from('jobs').select('*')
      const { data: skills } = await supabase.from('skills').select('*')
      if (!jobs || !skills) return

      const pTeam = playerChars.map(c => {
        const stats = calcStats(c.job, c.level, [], { hp: c.iv_hp, atk: c.iv_atk, def: c.iv_def })
        const bc = initBattleChar(c.id, c.name, c.job_id, 'player', stats, c.skills)
        if (initialHp && initialHp[c.id] !== undefined) {
          const carried = Math.max(0, initialHp[c.id])
          bc.currentHp = carried
          bc.isAlive = carried > 0
        }
        return bc
      })
      const cTeam = generateCpuTeam(avgLevel, jobs as Job[], skills as Skill[])
      setPlayerTeam(pTeam)
      setCpuTeam(cTeam)
      setBattlePhase('fighting')

      const res = runBattle(pTeam.map(c => ({ ...c })), cTeam.map(c => ({ ...c })))
      battleResult.current = res
      setWinner(res.winner)
      logsRef.current = res.logs
      currentLogIndexRef.current = -1
      scheduleFrom(0)
    }
    run()
  }, [])

  // バトル終了時に EXP・Gold 付与
  useEffect(() => {
    if (battlePhase !== 'done' || !user || !winner) return
    const exp = winner === 'player' ? 100 : winner === 'draw' ? 30 : 10
    const gold = winner === 'player' ? 50 : winner === 'draw' ? 10 : 0
    setRewardExp(exp)
    setRewardGold(gold)
    const apply = async () => {
      for (const char of playerChars) {
        // 冒険中に複数バトルしても正しく加算されるよう DB から最新値を取得
        const { data: cur } = await supabase
          .from('characters').select('exp, level, max_level').eq('id', char.id).single()
        if (!cur) continue
        const newExp = cur.exp + exp
        const newLevel = newExp >= cur.level * 100 && cur.level < cur.max_level ? cur.level + 1 : cur.level
        await supabase.from('characters').update({
          exp: newLevel > cur.level ? newExp - cur.level * 100 : newExp,
          level: newLevel,
        }).eq('id', char.id)
      }
      if (gold > 0) {
        const { data: u } = await supabase.from('users').select('gold').eq('id', user.id).single()
        await supabase.from('users').update({ gold: (u?.gold ?? 0) + gold }).eq('id', user.id)
      }
    }
    apply()
  }, [battlePhase, winner])

  // 自動冒険：バトル終了後に自動で次へ
  useEffect(() => {
    if (battlePhase !== 'done' || !autoMode || !battleResult.current) return
    const res = battleResult.current
    const finalHp: Record<string, number> = {}
    res.finalPlayerTeam.forEach(c => { finalHp[c.id] = Math.max(0, c.currentHp) })

    const id = setTimeout(() => {
      if (res.winner !== 'cpu') onContinue(finalHp)
      else onGameOver()
    }, 2000)
    return () => clearTimeout(id)
  }, [battlePhase, autoMode])

  const skipBattle = () => {
    const res = battleResult.current
    if (!res) return
    timeoutIds.current.forEach(id => clearTimeout(id))
    timeoutIds.current = []
    setPlayerTeam(res.finalPlayerTeam)
    setCpuTeam(res.finalCpuTeam)
    setCurrentLog(res.logs[res.logs.length - 1]?.message ?? '')
    setBattlePhase('done')
  }

  const handleContinue = () => {
    const res = battleResult.current
    if (!res) return
    const finalHp: Record<string, number> = {}
    res.finalPlayerTeam.forEach(c => { finalHp[c.id] = Math.max(0, c.currentHp) })
    onContinue(finalHp)
  }

  if (battlePhase === 'loading') {
    return <div className="text-center py-8 text-purple-400 text-sm">バトル準備中...</div>
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
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

      {/* 倍速 / スキップ */}
      {battlePhase === 'fighting' && (
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {SPEEDS.map(s => (
              <button key={s} onClick={() => changeSpeed(s)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  speed === s ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                }`}>
                {s}x
              </button>
            ))}
          </div>
          <button onClick={skipBattle}
            className="text-xs text-gray-500 hover:text-gray-300 bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors">
            skip »
          </button>
        </div>
      )}

      <div className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 min-h-[64px] flex items-center">
        <p className={`text-sm w-full ${
          currentLog.startsWith('===') ? 'text-yellow-400 font-bold text-center'
          : currentLog.includes('倒れた') ? 'text-red-400'
          : currentLog.includes('回復') ? 'text-green-400'
          : 'text-gray-200'
        }`}>{currentLog}</p>
      </div>

      {battlePhase === 'done' && winner && (
        <div className="text-center space-y-3">
          <div className={`text-xl font-bold ${
            winner === 'player' ? 'text-yellow-400' : winner === 'draw' ? 'text-gray-400' : 'text-red-400'
          }`}>
            {winner === 'player' ? '🏆 勝利！' : winner === 'draw' ? '🤝 引き分け' : '💀 敗北...'}
          </div>
          <div className="text-xs text-gray-400">
            EXP +{rewardExp}{rewardGold > 0 && ` / Gold +${rewardGold}`}
          </div>
          {autoMode && winner !== 'cpu' && (
            <p className="text-xs text-gray-500">自動で次へ進みます...</p>
          )}
          {!autoMode && (
            winner !== 'cpu' ? (
              <button onClick={handleContinue}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl transition-colors">
                進む
              </button>
            ) : (
              <button onClick={onGameOver}
                className="w-full bg-red-800 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-colors">
                冒険終了
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

export default AdventureBattle
