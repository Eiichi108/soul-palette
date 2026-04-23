import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import CharEquipModal from '../components/CharEquipModal'
import type { Character, Job, Skill } from '../types'

const JOB_ICONS: Record<number, string> = { 1: '⚔️', 2: '🔮', 3: '👊', 4: '🏹' }

const ivColor = (c: { iv_atk: number; iv_hp: number; iv_def: number }) =>
  `rgb(${c.iv_atk}, ${c.iv_hp}, ${c.iv_def})`
type CharWithJob = Character & { job: Job; skills: Skill[] }

export const DECK_KEY = 'soulpalette_deck'

export const loadDeckIds = (): string[] => {
  try { return JSON.parse(localStorage.getItem(DECK_KEY) ?? '[]') } catch { return [] }
}

const DeckPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [chars, setChars] = useState<CharWithJob[]>([])
  const [deck, setDeck] = useState<(CharWithJob | null)[]>([null, null, null, null])
  const deckLoaded = useRef(false)
  const [equipTarget, setEquipTarget] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const { data } = await supabase
        .from('characters')
        .select('*, job:jobs(*), skills:character_skills(skill:skills(*))')
        .eq('user_id', user.id)
      if (data) setChars(data.map(c => ({ ...c, skills: (c.skills as { skill: Skill }[]).map(s => s.skill) })))
    }
    load()
  }, [user])

  // キャラ読み込み後に localStorage からデッキ復元
  useEffect(() => {
    if (chars.length === 0 || deckLoaded.current) return
    deckLoaded.current = true
    const ids = loadDeckIds()
    const newDeck: (CharWithJob | null)[] = [null, null, null, null]
    ids.forEach((id, i) => { if (i < 4) newDeck[i] = chars.find(c => c.id === id) ?? null })
    setDeck(newDeck)
  }, [chars])

  // デッキ変更時に自動保存
  useEffect(() => {
    if (!deckLoaded.current) return
    localStorage.setItem(DECK_KEY, JSON.stringify(deck.filter(Boolean).map(c => c!.id)))
  }, [deck])

  const deckIds = deck.filter(Boolean).map(c => c!.id)
  const listChars = chars.filter(c => !deckIds.includes(c.id))
  const filledCount = deck.filter(Boolean).length

  const addToDeck = (char: CharWithJob) => {
    const idx = deck.findIndex(s => s === null)
    if (idx === -1) return
    setDeck(prev => prev.map((s, i) => i === idx ? char : s))
  }

  const removeFromDeck = (idx: number) => {
    setDeck(prev => prev.map((s, i) => i === idx ? null : s))
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white">←</button>
        <h1 className="text-lg font-bold">デッキ編成</h1>
        <span className="ml-auto text-xs text-gray-500">
          {filledCount > 0 ? `${filledCount}体 自動保存済み` : 'デッキ未設定'}
        </span>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        <p className="text-xs text-gray-400 mb-2">デッキ（{filledCount}/4）— タップで装備変更 / ×で外す</p>
        <div className="grid grid-cols-4 gap-2 mb-6">
          {deck.map((char, i) => (
            <div
              key={i}
              onClick={() => char && setEquipTarget({ id: char.id, name: char.name })}
              className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center transition-colors relative overflow-hidden ${
                char
                  ? 'bg-gray-800/80 cursor-pointer active:bg-gray-700/80'
                  : 'border-gray-600 bg-gray-800/50 border-dashed'
              }`}
              style={char ? { borderColor: ivColor(char) } : undefined}
            >
              {char ? (
                <>
                  <span className="text-2xl leading-none">{JOB_ICONS[char.job_id]}</span>
                  <span className="text-xs font-medium mt-1 px-1 w-full text-center truncate leading-tight">{char.name}</span>
                  <span className="text-xs text-gray-400">Lv.{char.level}</span>
                  <button
                    onClick={e => { e.stopPropagation(); removeFromDeck(i) }}
                    className="absolute top-0 right-0 p-1.5 text-gray-500 hover:text-red-400 transition-colors leading-none"
                  >×</button>
                </>
              ) : (
                <span className="text-gray-600 text-xl font-light">+</span>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 mb-2">所持キャラ — タップでデッキに追加</p>
        {chars.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            <p>キャラクターがいません</p>
            <button onClick={() => navigate('/characters/create')} className="mt-3 text-purple-400 underline text-sm">
              キャラを作成する
            </button>
          </div>
        ) : listChars.length === 0 ? (
          <p className="text-center py-4 text-gray-500 text-sm">全キャラがデッキに入っています</p>
        ) : (
          <div className="space-y-2">
            {listChars.map(c => (
              <div key={c.id} className="border-2 bg-gray-800 rounded-xl flex items-center overflow-hidden"
                style={{ borderColor: ivColor(c) }}>
                <button
                  onClick={() => addToDeck(c)}
                  disabled={filledCount >= 4}
                  className="flex-1 p-3 text-left flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors min-w-0"
                >
                  <span className="text-xl flex-shrink-0">{JOB_ICONS[c.job_id]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-gray-400">{c.job.name} Lv.{c.level}</div>
                  </div>
                  <span className="text-purple-400 text-xs flex-shrink-0">追加 →</span>
                </button>
                <button
                  onClick={() => setEquipTarget({ id: c.id, name: c.name })}
                  className="px-3 self-stretch flex items-center text-gray-400 hover:text-white hover:bg-gray-700 border-l border-gray-700 transition-colors flex-shrink-0"
                >
                  🛡️
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

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

export default DeckPage
