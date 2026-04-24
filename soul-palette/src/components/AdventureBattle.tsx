import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcStats } from '../utils/battle'
import { initBattleChar, generateCpuTeam, runBattle } from '../utils/battleEngine'
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

type Props = {
  playerChars: (Character & { job: Job; skills: Skill[] })[]
  avgLevel: number
  onContinue: () => void
  onGameOver: () => void
}

const AdventureBattle = ({ playerChars, avgLevel, onContinue, onGameOver }: Props) => {
  const [playerTeam, setPlayerTeam] = useState<BattleCharacter[]>([])
  const [cpuTeam, setCpuTeam] = useState<BattleCharacter[]>([])
  const [currentLog, setCurrentLog] = useState<string>('')
  const [battlePhase, setBattlePhase] = useState<'loading' | 'fighting' | 'done'>('loading')
  const [winner, setWinner] = useState<'player' | 'cpu' | 'draw' | null>(null)
  const started = useRef(false)
  const timeoutIds = useRef<ReturnType<typeof setTimeout>[]>([])
  const battleResult = useRef<BattleResult | null>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const run = async () => {
      const { data: jobs } = await supabase.from('jobs').select('*')
      const { data: skills } = await supabase.from('skills').select('*')
      if (!jobs || !skills) return

      const pTeam = playerChars.map(c =>
        initBattleChar(c.id, c.name, c.job_id, 'player',
          calcStats(c.job, c.level, [], { hp: c.iv_hp, atk: c.iv_atk, def: c.iv_def }), c.skills)
      )
      const cTeam = generateCpuTeam(avgLevel, jobs as Job[], skills as Skill[])
      setPlayerTeam(pTeam)
      setCpuTeam(cTeam)
      setBattlePhase('fighting')

      const res = runBattle(pTeam.map(c => ({ ...c })), cTeam.map(c => ({ ...c })))
      battleResult.current = res
      setWinner(res.winner)

      timeoutIds.current = []
      let delay = 0
      res.logs.forEach((log, i) => {
        delay += log.message.startsWith('===') ? 400 : 1200
        const id = setTimeout(() => {
          setCurrentLog(log.message)
          const applySnap = (prev: BattleCharacter[]) =>
            prev.map(c => {
              const s = log.snapshot.find(x => x.id === c.id)
              return s ? { ...c, currentHp: s.currentHp, shield: s.shield, isAlive: s.isAlive, statusEffects: s.statusEffects } : c
            })
          setPlayerTeam(applySnap)
          setCpuTeam(applySnap)
          if (i === res.logs.length - 1) setTimeout(() => setBattlePhase('done'), 800)
        }, delay)
        timeoutIds.current.push(id)
      })
    }
    run()
  }, [])

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

      {battlePhase === 'fighting' && (
        <button onClick={skipBattle}
          className="w-full text-xs text-gray-500 hover:text-gray-300 py-1 text-right pr-1 transition-colors">
          スキップ »
        </button>
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
          {winner !== 'cpu' ? (
            <button onClick={onContinue}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl transition-colors">
              進む
            </button>
          ) : (
            <button onClick={onGameOver}
              className="w-full bg-red-800 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-colors">
              冒険終了
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default AdventureBattle
