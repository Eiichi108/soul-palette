import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Character, Job } from '../types'

const JOB_ICONS: Record<number, string> = { 1: '⚔️', 2: '🔮', 3: '👊', 4: '🏹' }

const ivColor = (c: { iv_atk: number; iv_hp: number; iv_def: number }) =>
  `rgb(${c.iv_atk}, ${c.iv_hp}, ${c.iv_def})`

type CharWithJob = Character & { job: Job }

const CharCard = ({
  char,
  onClick,
  dimmed,
  subLabel,
}: {
  char: CharWithJob
  onClick: () => void
  dimmed?: boolean
  subLabel?: string
}) => (
  <button
    onClick={onClick}
    disabled={dimmed}
    className={`w-full border-2 bg-gray-800 rounded-xl p-3 text-left flex items-center gap-3 transition-colors ${
      dimmed ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-700 active:bg-gray-700'
    }`}
    style={{ borderColor: ivColor(char) }}
  >
    <span className="text-2xl flex-shrink-0">{JOB_ICONS[char.job_id]}</span>
    <div className="flex-1 min-w-0">
      <div className="font-medium truncate">{char.name}</div>
      <div className="text-xs text-gray-400">
        {char.job.name} · Lv.{char.level} / 上限{char.max_level}
      </div>
    </div>
    {subLabel && <span className="text-xs text-gray-500 flex-shrink-0">{subLabel}</span>}
  </button>
)

// 将来のタブはここに追加
const TABS = [{ id: 'fusion', label: '合成' }]

type Step = 'select1' | 'select2' | 'confirm'

const EnhancePage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('fusion')
  const [chars, setChars] = useState<CharWithJob[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('select1')
  const [char1, setChar1] = useState<CharWithJob | null>(null)
  const [char2, setChar2] = useState<CharWithJob | null>(null)
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)
  const [resultMaxLevel, setResultMaxLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const { data } = await supabase
        .from('characters')
        .select('*, job:jobs(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (data) setChars(data as CharWithJob[])
      setLoading(false)
    }
    load()
  }, [user])

  const reset = () => {
    setChar1(null)
    setChar2(null)
    setStep('select1')
    setDone(false)
    setError(null)
  }

  const switchTab = (id: string) => {
    setTab(id)
    reset()
  }

  const execFusion = async () => {
    if (!char1 || !char2) return
    setProcessing(true)
    setError(null)
    const newMax = Math.min(100, char1.max_level + 5)
    try {
      const { error: e1 } = await supabase
        .from('characters')
        .update({ max_level: newMax })
        .eq('id', char1.id)
      if (e1) throw e1

      // FK制約に備えて関連レコードを先に削除
      await supabase.from('character_skills').delete().eq('character_id', char2.id)
      await supabase.from('character_equipments').delete().eq('character_id', char2.id)
      const { error: e2 } = await supabase.from('characters').delete().eq('id', char2.id)
      if (e2) throw e2

      setResultMaxLevel(newMax)
      setDone(true)
      // ローカルのcharsリストを更新
      setChars(prev =>
        prev
          .filter(c => c.id !== char2.id)
          .map(c => (c.id === char1.id ? { ...c, max_level: newMax } : c))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '合成に失敗しました')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white">←</button>
        <h1 className="text-lg font-bold">強化</h1>
      </header>

      {/* タブ */}
      <div className="flex border-b border-gray-700 bg-gray-800">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`px-6 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === t.id
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto px-4 py-4">
        {tab === 'fusion' && (
          loading ? (
            <div className="text-center py-12 text-gray-400">読み込み中...</div>
          ) : done ? (
            /* ===== 完了 ===== */
            <div className="text-center py-12 space-y-4">
              <div className="text-5xl">✨</div>
              <h2 className="text-xl font-bold">合成完了！</h2>
              <p className="text-gray-400 text-sm">
                {char1?.name} の上限レベルが{' '}
                <span className="text-purple-400 font-bold">{resultMaxLevel}</span> になりました
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={reset}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl font-medium transition-colors"
                >
                  続けて合成する
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-xl transition-colors"
                >
                  ホームへ
                </button>
              </div>
            </div>
          ) : step === 'confirm' && char1 && char2 ? (
            /* ===== 確認 ===== */
            <div className="space-y-4">
              <p className="text-sm text-gray-400">以下の内容で合成しますか？</p>
              <div className="bg-gray-800 rounded-xl p-4 space-y-3 border border-gray-700">
                <div>
                  <div className="text-xs text-gray-400 mb-1">ベースキャラ（強化される）</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{JOB_ICONS[char1.job_id]}</span>
                    <div>
                      <div className="font-medium">{char1.name}</div>
                      <div className="text-xs">
                        <span className="text-gray-400">上限レベル {char1.max_level}</span>
                        {' → '}
                        <span className="text-purple-400 font-bold">{Math.min(100, char1.max_level + 5)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-gray-700 pt-3">
                  <div className="text-xs text-red-400 mb-1">素材キャラ（消滅する）</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{JOB_ICONS[char2.job_id]}</span>
                    <div>
                      <div className="font-medium">{char2.name}</div>
                      <div className="text-xs text-gray-400">{char2.job.name} · Lv.{char2.level}</div>
                    </div>
                  </div>
                </div>
              </div>
              {error && <p className="text-sm text-red-400 bg-red-900/30 p-3 rounded-lg">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setStep('select2')}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 py-2.5 rounded-xl transition-colors"
                >
                  戻る
                </button>
                <button
                  onClick={execFusion}
                  disabled={processing}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed py-2.5 rounded-xl font-bold transition-colors"
                >
                  {processing ? '合成中...' : '合成する'}
                </button>
              </div>
            </div>
          ) : step === 'select2' && char1 ? (
            /* ===== キャラ2選択 ===== */
            <div className="space-y-3">
              <p className="text-xs text-gray-400 mb-1">
                素材キャラを選ぶ（{char1.job.name}のみ — 選んだキャラは消滅します）
              </p>
              {/* 選択済みchar1のミニ表示 */}
              <div
                className="bg-gray-800 rounded-xl px-3 py-2 flex items-center gap-2 border"
                style={{ borderColor: ivColor(char1) }}
              >
                <span className="text-lg">{JOB_ICONS[char1.job_id]}</span>
                <span className="text-sm font-medium">{char1.name}</span>
                <span className="text-xs text-gray-400 ml-auto">上限{char1.max_level} → {Math.min(100, char1.max_level + 5)}</span>
              </div>
              {chars.filter(c => c.job_id === char1.job_id && c.id !== char1.id).length === 0 ? (
                <p className="text-center py-8 text-gray-500 text-sm">
                  同じ職業のキャラが他にいません
                </p>
              ) : (
                <div className="space-y-2">
                  {chars
                    .filter(c => c.job_id === char1.job_id && c.id !== char1.id)
                    .map(c => (
                      <CharCard
                        key={c.id}
                        char={c}
                        onClick={() => { setChar2(c); setStep('confirm') }}
                      />
                    ))}
                </div>
              )}
              <button
                onClick={() => { setChar1(null); setStep('select1') }}
                className="w-full text-gray-400 text-sm underline pt-1"
              >
                ← キャラ1を選び直す
              </button>
            </div>
          ) : (
            /* ===== キャラ1選択 ===== */
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                ベースキャラを選ぶ（上限レベルが+5 / 上限Lv100まで）
              </p>
              {chars.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">キャラクターがいません</div>
              ) : (
                <div className="space-y-2">
                  {chars.map(c => (
                    <CharCard
                      key={c.id}
                      char={c}
                      onClick={() => { setChar1(c); setStep('select2') }}
                      dimmed={c.max_level >= 100}
                      subLabel={c.max_level >= 100 ? '上限MAX' : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </main>
    </div>
  )
}

export default EnhancePage
