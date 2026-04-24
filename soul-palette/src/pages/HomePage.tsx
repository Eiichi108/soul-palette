import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const HomePage = () => {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [gold, setGold] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    const fetch = async () => {
      // usersレコードがなければ作成
      await supabase.from('users').upsert({ id: user.id }, { onConflict: 'id' })
      const { data } = await supabase.from('users').select('gold').eq('id', user.id).single()
      setGold(data?.gold ?? 0)
    }
    fetch()
  }, [user])

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* ヘッダー */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-purple-400">Soul Palette</h1>
        <div className="flex items-center gap-3">
          {gold !== null && (
            <span className="text-sm text-amber-400 bg-gray-700 px-3 py-1 rounded-lg">
              💰 {gold.toLocaleString()}G
            </span>
          )}
          <button onClick={() => signOut()} className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded-lg transition-colors">
            ログアウト
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-1">ホーム</h2>
          <p className="text-gray-400 text-sm">{user?.email}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => navigate('/characters')}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-6 text-center transition-colors">
            <div className="text-3xl mb-2">⚔️</div>
            <div className="font-medium">キャラクター</div>
            <div className="text-xs text-gray-400 mt-1">育成・管理</div>
          </button>
          <button onClick={() => navigate('/equipment')}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-6 text-center transition-colors">
            <div className="text-3xl mb-2">🛡️</div>
            <div className="font-medium">装備</div>
            <div className="text-xs text-gray-400 mt-1">強化・着脱</div>
          </button>
          <button onClick={() => navigate('/quest')}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-6 text-center transition-colors">
            <div className="text-3xl mb-2">📜</div>
            <div className="font-medium">クエスト</div>
            <div className="text-xs text-gray-400 mt-1">冒険に出よう</div>
          </button>
          <button onClick={() => navigate('/deck')}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-6 text-center transition-colors">
            <div className="text-3xl mb-2">🃏</div>
            <div className="font-medium">デッキ編成</div>
            <div className="text-xs text-gray-400 mt-1">パーティ組み替え</div>
          </button>
          <button onClick={() => navigate('/enhance')}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-6 text-center transition-colors">
            <div className="text-3xl mb-2">⬆️</div>
            <div className="font-medium">強化</div>
            <div className="text-xs text-gray-400 mt-1">合成・上限突破</div>
          </button>
          <button onClick={() => navigate('/adventure')}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-6 text-center transition-colors">
            <div className="text-3xl mb-2">🗺️</div>
            <div className="font-medium">冒険</div>
            <div className="text-xs text-gray-400 mt-1">進むたびにイベント発生</div>
          </button>
          <button onClick={() => navigate('/battle')}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 col-span-2 rounded-xl p-5 text-center transition-colors">
            <div className="text-3xl mb-2">⚡</div>
            <div className="font-medium">自由バトル</div>
            <div className="text-xs text-gray-400 mt-1">デッキのキャラでそのまま出撃</div>
          </button>
        </div>
      </main>
    </div>
  )
}

export default HomePage
