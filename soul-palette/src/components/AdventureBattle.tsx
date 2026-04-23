import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcStats } from '../utils/battle'
import { initBattleChar, generateCpuTeam, runBattle } from '../utils/battleEngine'
import type { BattleCharacter, Character, Job, Skill } from '../types'

const JOB_ICONS: Record<number, string> = { 1: '⚔️', 2: '🔮', 3: '👊', 4: '🏹' }

const HpBar = ({ char }: { char: BattleCharacter }) => {
  const pct = Math.max(0, (char.currentHp / char.maxHp) * 100)
  const color = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className={`rounded-lg p-2 bg-gray-700 ${!char.isAlive ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs">{JOB_ICONS[char.jobId]}</span>
        <span className="text-xs font-medium truncate">{char.name}</span>
        {char.shield > 0 && <span className="text-xs text-blue-300 ml-auto">🛡{char.shield}</span>}
      </div>
      <div className="h-1.5 bg-gray-600 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-gray-400 mt-0.5">{Math.max(0, char.currentHp)}/{char.maxHp}</div>
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
  const [visibleLogs, setVisibleLogs] = useState<string[]>([])
  const [battlePhase, setBattlePhase] = useState<'loading' | 'fighting' | 'done'>('loading')
  const [winner, setWinner] = useState<'player' | 'cpu' | 'draw' | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)

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
      setWinner(res.winner)

      let delay = 0
      res.logs.forEach((log, i) => {
        delay += log.message.startsWith('===') ? 200 : 600
        setTimeout(() => {
          setVisibleLogs(prev => [...prev, log.message])
          const applySnap = (prev: BattleCharacter[]) =>
            prev.map(c => {
              const s = log.snapshot.find(x => x.id === c.id)
              return s ? { ...c, currentHp: s.currentHp, shield: s.shield, isAlive: s.isAlive, statusEffects: s.statusEffects } : c
            })
          setPlayerTeam(applySnap)
          setCpuTeam(applySnap)
          if (i === res.logs.length - 1) setTimeout(() => setBattlePhase('done'), 500)
        }, delay)
      })
    }
    run()
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [visibleLogs])

  if (battlePhase === 'loading') {
    return <div className="text-center py-8 text-purple-400 text-sm">バトル準備中...</div>
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-blue-400 mb-1 text-center">味方</div>
          <div className="space-y-1">{playerTeam.map(c => <HpBar key={c.id} char={c} />)}</div>
        </div>
        <div>
          <div className="text-xs text-red-400 mb-1 text-center">敵</div>
          <div className="space-y-1">{cpuTeam.map(c => <HpBar key={c.id} char={c} />)}</div>
        </div>
      </div>

      <div ref={logRef} className="overflow-y-auto px-3 py-2 space-y-1 bg-gray-950 rounded-lg" style={{ maxHeight: '180px' }}>
        {visibleLogs.map((msg, i) => (
          <p key={i} className={`text-xs ${
            msg.startsWith('===') ? 'text-yellow-400 font-bold mt-1'
            : msg.includes('倒れた') ? 'text-red-400'
            : msg.includes('回復') ? 'text-green-400'
            : 'text-gray-300'
          }`}>{msg}</p>
        ))}
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
