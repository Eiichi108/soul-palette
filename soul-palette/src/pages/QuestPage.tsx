import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Quest } from '../types'

type QuestStatus = 'locked' | 'available' | 'completed'

const QuestPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [quests, setQuests] = useState<Quest[]>([])
  const [statusMap, setStatusMap] = useState<Record<number, QuestStatus>>({})
  const [maxLevel, setMaxLevel] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const fetch = async () => {
      setLoading(true)
      try {
        // クエスト一覧
        const { data: qData, error: qErr } = await supabase
          .from('quests').select('*').order('order_index')
        if (qErr) throw qErr

        // プレイヤーの最大レベル
        const { data: chars } = await supabase
          .from('characters').select('level').eq('user_id', user.id)
        const ml = chars && chars.length > 0 ? Math.max(...chars.map(c => c.level)) : 1
        setMaxLevel(ml)

        // クリア済みクエスト
        const { data: uqData } = await supabase
          .from('user_quests').select('quest_id, status').eq('user_id', user.id)
        const clearedIds = new Set((uqData ?? []).filter(q => q.status === 'completed').map(q => q.quest_id))

        const map: Record<number, QuestStatus> = {}
        for (const q of (qData ?? [])) {
          if (clearedIds.has(q.id)) map[q.id] = 'completed'
          else if (ml >= q.required_level) map[q.id] = 'available'
          else map[q.id] = 'locked'
        }

        setQuests(qData ?? [])
        setStatusMap(map)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'データ取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [user])

  const handleStart = (quest: Quest) => {
    navigate('/battle', {
      state: {
        questId: quest.id,
        questTitle: quest.title,
        questLevel: quest.required_level,
        rewardExp: quest.reward_exp,
        rewardGold: quest.reward_gold,
      },
    })
  }

  const difficultyLabel = (level: number) => {
    if (level <= 3) return { text: 'やさしい', color: 'text-green-400' }
    if (level <= 8) return { text: 'ふつう', color: 'text-yellow-400' }
    if (level <= 18) return { text: 'むずかしい', color: 'text-orange-400' }
    return { text: 'とても難しい', color: 'text-red-400' }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white">←</button>
        <h1 className="text-lg font-bold">クエスト</h1>
        <span className="ml-auto text-xs text-gray-400">最高Lv.{maxLevel}</span>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : (
          <div className="space-y-3">
            {quests.map((quest) => {
              const status = statusMap[quest.id] ?? 'locked'
              const diff = difficultyLabel(quest.required_level)
              return (
                <div key={quest.id}
                  className={`border rounded-xl p-4 transition-colors ${
                    status === 'locked' ? 'border-gray-700 bg-gray-800/50 opacity-50' :
                    status === 'completed' ? 'border-green-700 bg-gray-800' :
                    'border-gray-700 bg-gray-800'
                  }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        {status === 'locked' && <span className="text-gray-500">🔒</span>}
                        {status === 'completed' && <span className="text-green-400">✓</span>}
                        <span className="font-bold">{quest.title}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{quest.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs mb-3">
                    <span className="text-gray-400">必要Lv.{quest.required_level}</span>
                    <span className={diff.color}>{diff.text}</span>
                    <span className="ml-auto text-yellow-400">EXP+{quest.reward_exp}</span>
                    <span className="text-amber-400">G+{quest.reward_gold}</span>
                  </div>

                  {status !== 'locked' && (
                    <button onClick={() => handleStart(quest)}
                      className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                        status === 'completed'
                          ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}>
                      {status === 'completed' ? '再挑戦' : '挑戦する'}
                    </button>
                  )}
                  {status === 'locked' && (
                    <p className="text-xs text-gray-500 text-center">Lv.{quest.required_level}のキャラが必要</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

export default QuestPage
