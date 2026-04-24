import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calcStats } from '../utils/stats'
import CharEquipModal from '../components/CharEquipModal'
import type { Character, Job, Skill } from '../types'

const JOB_ICONS: Record<number, string> = { 1: '⚔️', 2: '🔮', 3: '👊', 4: '🏹' }
const ivColor = (c: { iv_atk: number; iv_hp: number; iv_def: number }) =>
  `rgb(${c.iv_atk}, ${c.iv_hp}, ${c.iv_def})`

const SKILL_TYPE_COLOR: Record<string, string> = {
  '攻撃': 'bg-red-900/50 text-red-300',
  'パッシブ': 'bg-gray-700 text-gray-300',
  'バフ': 'bg-blue-900/50 text-blue-300',
  'デバフ': 'bg-purple-900/50 text-purple-300',
  'ヒール': 'bg-green-900/50 text-green-300',
}

type CharacterWithDetails = Character & { job: Job; skills: Skill[] }

const sellPrice = (c: CharacterWithDetails) => Math.max(10, c.level * 10)

const CharacterListPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [characters, setCharacters] = useState<CharacterWithDetails[]>([])
  const [selected, setSelected] = useState<CharacterWithDetails | null>(null)
  const [equipTarget, setEquipTarget] = useState<{ id: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sellMode, setSellMode] = useState(false)
  const [sellSelectedIds, setSellSelectedIds] = useState<Set<string>>(new Set())
  const [selling, setSelling] = useState(false)

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
      setCharacters((data ?? []).map((c) => ({
        ...c,
        skills: (c.skills as { skill: Skill }[]).map((s) => s.skill),
      })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データ取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCharacters() }, [user])

  const toggleSellSelect = (id: string) => {
    setSellSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const totalSellGold = characters
    .filter(c => sellSelectedIds.has(c.id))
    .reduce((sum, c) => sum + sellPrice(c), 0)

  const handleSell = async () => {
    if (!user || sellSelectedIds.size === 0 || selling) return
    setSelling(true)
    setError(null)
    try {
      const ids = [...sellSelectedIds]
      await supabase.from('character_equipments').delete().in('character_id', ids)
      await supabase.from('character_skills').delete().in('character_id', ids)
      await supabase.from('characters').delete().in('id', ids)
      const { data: u } = await supabase.from('users').select('gold').eq('id', user.id).single()
      await supabase.from('users').update({ gold: (u?.gold ?? 0) + totalSellGold }).eq('id', user.id)
      setSellSelectedIds(new Set())
      setSellMode(false)
      fetchCharacters()
    } catch (err) {
      setError(err instanceof Error ? err.message : '売却に失敗しました')
    } finally {
      setSelling(false)
    }
  }

  const exitSellMode = () => {
    setSellMode(false)
    setSellSelectedIds(new Set())
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (sellMode) exitSellMode(); else navigate('/') }}
            className="text-gray-400 hover:text-white">←</button>
          <h1 className="text-lg font-bold">キャラクター</h1>
        </div>
        <div className="flex items-center gap-2">
          {sellMode ? (
            <button onClick={exitSellMode}
              className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
              キャンセル
            </button>
          ) : (
            <>
              <button onClick={() => setSellMode(true)}
                className="text-sm bg-gray-700 hover:bg-gray-600 text-amber-400 px-3 py-1.5 rounded-lg transition-colors">
                売却
              </button>
              <button onClick={() => navigate('/characters/create')}
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors">
                + 新規作成
              </button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-32">
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        {sellMode && (
          <p className="text-xs text-amber-400/80 mb-3">売却するキャラを選んでください（複数選択可）</p>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : characters.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">⚔️</div>
            <p className="text-gray-400 mb-4">キャラクターがいません</p>
            <button onClick={() => navigate('/characters/create')}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors">
              最初のキャラを作成
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {characters.map((char) => {
              const stats = calcStats(char.job, char.level, [], { hp: char.iv_hp, atk: char.iv_atk, def: char.iv_def })
              const isSelected = sellSelectedIds.has(char.id)
              const price = sellPrice(char)
              return (
                <button
                  key={char.id}
                  onClick={() => sellMode ? toggleSellSelect(char.id) : setSelected(char)}
                  className={`w-full bg-gray-800 border-2 rounded-xl p-4 text-left transition-colors relative ${
                    sellMode
                      ? isSelected
                        ? 'border-amber-400 bg-amber-900/20'
                        : 'hover:bg-gray-700 border-gray-600'
                      : 'hover:bg-gray-700'
                  }`}
                  style={!sellMode ? { borderColor: ivColor(char) } : undefined}
                >
                  {/* 売却モード: チェックマーク */}
                  {sellMode && (
                    <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? 'bg-amber-400 border-amber-400' : 'border-gray-500'
                    }`}>
                      {isSelected && <span className="text-gray-900 text-xs font-bold">✓</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{JOB_ICONS[char.job_id]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold">{char.name}</div>
                      <div className="text-xs text-gray-400">
                        {char.job.name} · Lv.{char.level}
                        {char.level < char.max_level
                          ? <span className="ml-1 text-gray-500">({char.exp}/{char.level * 100}EXP)</span>
                          : <span className="ml-1 text-yellow-600">MAX</span>
                        }
                      </div>
                    </div>
                    {sellMode && (
                      <span className="text-amber-400 text-sm font-bold shrink-0">{price}G</span>
                    )}
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

      {/* 売却モード: 固定フッター */}
      {sellMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 px-4 py-4 z-40">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <div className="flex-1 text-sm text-gray-300">
              <span className="text-white font-bold">{sellSelectedIds.size}</span>件選択中
              {sellSelectedIds.size > 0 && (
                <span className="ml-2 text-amber-400 font-bold">合計 {totalSellGold}G</span>
              )}
            </div>
            <button
              onClick={handleSell}
              disabled={sellSelectedIds.size === 0 || selling}
              className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
            >
              {selling ? '売却中...' : '売却する'}
            </button>
          </div>
        </div>
      )}

      {/* キャラ詳細モーダル */}
      {selected && !sellMode && (
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
                  {selected.level < selected.max_level ? `EXP ${selected.exp} / ${selected.level * 100}` : 'EXP MAX'}
                </p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span style={{ color: `rgb(${selected.iv_atk},80,80)` }}>ATK個体値 {selected.iv_atk}</span>
                  <span style={{ color: `rgb(80,${selected.iv_hp},80)` }}>HP個体値 {selected.iv_hp}</span>
                  <span style={{ color: `rgb(80,80,${selected.iv_def})` }}>DEF個体値 {selected.iv_def}</span>
                </div>
              </div>
            </div>
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
            <div>
              <h3 className="text-sm text-gray-400 mb-2">スキル</h3>
              <div className="space-y-2">
                {selected.skills.map((skill) => (
                  <div key={skill.id} className="bg-gray-700 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SKILL_TYPE_COLOR[skill.type]}`}>{skill.type}</span>
                      <span className="font-medium text-sm">{skill.name}</span>
                      {skill.power > 0 && <span className="text-xs text-gray-400 ml-auto">威力{skill.power}</span>}
                    </div>
                    <p className="text-xs text-gray-400">{skill.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setEquipTarget({ id: selected.id, name: selected.name })}
              className="mt-4 w-full bg-purple-700 hover:bg-purple-600 text-white py-2 rounded-lg transition-colors text-sm font-medium">
              🛡️ 装備を変更する
            </button>
            <button onClick={() => setSelected(null)}
              className="mt-2 w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors">
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
