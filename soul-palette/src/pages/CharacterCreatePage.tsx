import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calcStat } from '../utils/stats'
import type { Job, Skill } from '../types'

const JOB_COLORS: Record<number, string> = {
  1: 'border-red-500 bg-red-900/20',
  2: 'border-blue-500 bg-blue-900/20',
  3: 'border-yellow-500 bg-yellow-900/20',
  4: 'border-green-500 bg-green-900/20',
}

const JOB_ICONS: Record<number, string> = {
  1: '⚔️', 2: '🔮', 3: '👊', 4: '🏹',
}

const CharacterCreatePage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [characterName, setCharacterName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchJobs = async () => {
      const { data, error } = await supabase.from('jobs').select('*').order('id')
      if (error) setError(error.message)
      else setJobs(data)
    }
    fetchJobs()
  }, [])

  const handleCreate = async () => {
    if (!user || !selectedJob || !characterName.trim()) return
    setLoading(true)
    setError(null)

    try {
      // usersレコードがなければ作成
      await supabase.from('users').upsert({ id: user.id }, { onConflict: 'id' })

      // 個体値をランダム生成（0〜255）
      const iv_hp  = Math.floor(Math.random() * 256)
      const iv_atk = Math.floor(Math.random() * 256)
      const iv_def = Math.floor(Math.random() * 256)

      // キャラクター作成
      const { data: character, error: charError } = await supabase
        .from('characters')
        .insert({ user_id: user.id, name: characterName.trim(), job_id: selectedJob.id, iv_hp, iv_atk, iv_def })
        .select()
        .single()
      if (charError) throw charError

      // 職業の8スキルを取得してランダムで4つ抽選
      const { data: skills, error: skillError } = await supabase
        .from('skills')
        .select('*')
        .eq('job_id', selectedJob.id)
      if (skillError) throw skillError

      const shuffled = (skills as Skill[]).sort(() => Math.random() - 0.5).slice(0, 4)
      const skillInserts = shuffled.map((skill, index) => ({
        character_id: character.id,
        skill_id: skill.id,
        slot: index + 1,
      }))

      const { error: csError } = await supabase.from('character_skills').insert(skillInserts)
      if (csError) throw csError

      navigate('/characters')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'キャラクター作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/characters')} className="text-gray-400 hover:text-white">←</button>
        <h1 className="text-lg font-bold">キャラクター作成</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        {/* 職業選択 */}
        <div>
          <h2 className="text-sm text-gray-400 mb-3">職業を選ぶ</h2>
          <div className="grid grid-cols-2 gap-3">
            {jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => setSelectedJob(job)}
                className={`border-2 rounded-xl p-4 text-left transition-all ${
                  selectedJob?.id === job.id
                    ? JOB_COLORS[job.id]
                    : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                }`}
              >
                <div className="text-2xl mb-1">{JOB_ICONS[job.id]}</div>
                <div className="font-bold">{job.name}</div>
                <div className="text-xs text-gray-400 mt-1">{job.description}</div>
                {selectedJob?.id === job.id && (
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    <span className="text-red-400">HP {calcStat(job.base_hp, 1)}</span>
                    <span className="text-orange-400">ATK {calcStat(job.base_atk, 1)}</span>
                    <span className="text-blue-400">DEF {calcStat(job.base_def, 1)}</span>
                    <span className="text-green-400">SPD {calcStat(job.base_spd, 1)}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* キャラ名入力 */}
        <div>
          <h2 className="text-sm text-gray-400 mb-2">キャラクター名</h2>
          <input
            type="text"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            maxLength={20}
            placeholder="名前を入力..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* 作成ボタン */}
        <button
          onClick={handleCreate}
          disabled={!selectedJob || !characterName.trim() || loading}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
        >
          {loading ? '作成中...' : 'キャラクターを作成'}
        </button>
      </main>
    </div>
  )
}

export default CharacterCreatePage
