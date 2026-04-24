import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import CharacterListPage from './pages/CharacterListPage'
import CharacterCreatePage from './pages/CharacterCreatePage'
import EquipmentPage from './pages/EquipmentPage'
import BattlePage from './pages/BattlePage'
import DeckPage from './pages/DeckPage'
import QuestPage from './pages/QuestPage'
import EnhancePage from './pages/EnhancePage'
import AdventurePage from './pages/AdventurePage'

// 認証済みの場合のみアクセス可能なルート
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-purple-400 text-lg">読み込み中...</div>
      </div>
    )
  }

  return user ? <>{children}</> : <Navigate to="/auth" replace />
}

// 未ログインの場合のみアクセス可能なルート
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-purple-400 text-lg">読み込み中...</div>
      </div>
    )
  }

  return !user ? <>{children}</> : <Navigate to="/" replace />
}

const AppRoutes = () => {
  return (
    <Routes>
      <Route
        path="/auth"
        element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <HomePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/characters"
        element={
          <PrivateRoute>
            <CharacterListPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/characters/create"
        element={
          <PrivateRoute>
            <CharacterCreatePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/equipment"
        element={
          <PrivateRoute>
            <EquipmentPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/battle"
        element={
          <PrivateRoute>
            <BattlePage />
          </PrivateRoute>
        }
      />
      <Route path="/deck" element={<PrivateRoute><DeckPage /></PrivateRoute>} />
      <Route path="/quest" element={<PrivateRoute><QuestPage /></PrivateRoute>} />
      <Route path="/enhance" element={<PrivateRoute><EnhancePage /></PrivateRoute>} />
      <Route path="/adventure" element={<PrivateRoute><AdventurePage /></PrivateRoute>} />
      {/* 未定義のパスはホームへリダイレクト */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
