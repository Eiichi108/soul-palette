import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calcStats } from '../utils/stats'
import CharEquipModal from '../components/CharEquipModal'
import type { Character, Job, Skill } from '../types'

const JOB_ICONS: Record<number, string> = {
  1: '⚔️', 2: '🔮', 3: '👊', 4: '🏹',
}

const ivColor = (c: { iv_atk: number; iv_hp: number; iv_def: number }) =>
  `rgb(${c.iv_atk}, ${c.iv_hp}, ${c.iv_def})`

type CharacterWithDetails = Character & { job: Job; skills: Skill[] }

const CharacterListPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [characters, setCharacters] = useState<CharacterWithDetails[]>([])
  const [selected, setSelected] = useState<CharacterWithDetails | null>(null)
  const [equipTarget, setEquipTarget] = useState<{ id: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCharacters = async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('characters')
        .select(`*, job:jobs(*), skills:character_skills(skill:skills(*))`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error

      // character_skillsのネスト構造をフラット化
      const formatted = (data ?? []).map((c) => ({
        ...c,
        skills: (c.skills as { skill: Skill }[]).map((s) => s.skill),
      }))
      setCharacters(formatted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データ取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCharacters() }, [user])

  const SKILL_TYPE_COLOR: Record<string, string> = {
    '攻撃': 'bg-red-900/50 text-red-300',
    'パッシブ': 'bg-gray-700 text-gray-300',
    'バフ': 'bg-blue-900/50 text-blue-300',
    'デバフ': 'bg-purple-900/50 text-purple-300',
    'ヒール': 'bg-green-900/50 text-green-300',
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white">←</button>
          <h1 className="text-lg font-bold">キャラクター</h1>
        </div>
        <button
          onClick={() => navigate('/characters/create')}
          className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
        >
          + 新規作成
        </button>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : characters.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">⚔️</div>
            <p className="text-gray-400 mb-4">キャラクターがいません</p>
            <button
              onClick={() => navigate('/characters/create')}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              最初のキャラを作成
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {characters.map((char) => {
              const stats = calcStats(char.job, char.level, [], { hp: char.iv_hp, atk: char.iv_atk, def: char.iv_def })
              return (
                <button
                  key={char.id}
                  onClick={() => setSelected(char)}
                  className="w-full bg-gray-800 hover:bg-gray-700 border-2 rounded-xl p-4 text-left transition-colors"
                  style={{ borderColor: ivColor(char) }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{JOB_ICONS[char.job_id]}</span>
                    <div>
                      <div className="font-bold">{char.name}</div>
                      <div className="text-xs text-gray-400">
                        {char.job.name} · Lv.{char.level}
                        {char.level < char.max_level
                          ? <span className="ml-1 text-gray-500">({char.exp}/{char.level * 100}EXP)</span>
                          : <span className="ml-1 text-yellow-600">MAX</span>
                        }
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs text-center">
                    <div><span className="text-red-400">HP</span><br />{stats.hp}</div>
                    <div><span className="text-orange-400">ATK</span><br />{stats.atk}</div>
                    <div><span className="text-blue-400">DEF</span><br />{stats.def}</div>
                    <div><span className="text-green-400">SPD</span><br />{stats.spd}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* キャラ詳細モーダル */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
          onClick={() => setSelected(null)}>
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{JOB_ICONS[selected.job_id]}</span>
              <div>
                <h2 className="text-xl font-bold">{selected.name}</h2>
                <p className="text-sm text-gray-400">{selected.job.name} · Lv.{selected.level} / {selected.max_level}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selected.level < selected.max_level
                    ? `EXP ${selected.exp} / ${selected.level * 100}`
                    : 'EXP MAX'
                  }
                </p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span style={{ color: `rgb(${selected.iv_atk},80,80)` }}>ATK個体値 {selected.iv_atk}</span>
                  <span style={{ color: `rgb(80,${selected.iv_hp},80)` }}>HP個体値 {selected.iv_hp}</span>
                  <span style={{ color: `rgb(80,80,${selected.iv_def})` }}>DEF個体値 {selected.iv_def}</span>
                </div>
              </div>
            </div>

            {/* ステータス */}
            <div className="grid grid-cols-4 gap-2 text-center mb-4">
              {(['hp','atk','def','spd'] as const).map((key) => {
                const stats = calcStats(selected.job, selected.level, [], { hp: selected.iv_hp, atk: selected.iv_atk, def: selected.iv_def })
                const labels = { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD' }
                const colors = { hp: 'text-red-400', atk: 'text-orange-400', def: 'text-blue-400', spd: 'text-green-400' }
                return (
                  <div key={key} className="bg-gray-700 rounded-lg py-2">
                    <div className={`text-xs ${colors[key]}`}>{labels[key]}</div>
                    <div className="font-bold">{stats[key]}</div>
                  </div>
                )
              })}
            </div>

            {/* スキル */}
            <div>
              <h3 className="text-sm text-gray-400 mb-2">スキル</h3>
              <div className="space-y-2">
                {selected.skills.map((skill) => (
                  <div key={skill.id} className="bg-gray-700 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SKILL_TYPE_COLOR[skill.type]}`}>
                        {skill.type}
                      </span>
                      <span className="font-medium text-sm">{skill.name}</span>
                      {skill.power > 0 && <span className="text-xs text-gray-400 ml-auto">威力{skill.power}</span>}
                    </div>
                    <p className="text-xs text-gray-400">{skill.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setEquipTarget({ id: selected.id, name: selected.name })}
              className="mt-4 w-full bg-purple-700 hover:bg-purple-600 text-white py-2 rounded-lg transition-colors text-sm font-medium"
            >
              🛡️ 装備を変更する
            </button>
            <button
              onClick={() => setSelected(null)}
              className="mt-2 w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {equipTarget && (
        <CharEquipModal
          characterId={equipTarget.id}
          characterName={equipTarget.name}
          onClose={() => setEquipTarget(null)}
        />
      )}
    </div>
  )
}

export default CharacterListPage
