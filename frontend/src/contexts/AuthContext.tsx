import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { User } from '../types'
import api from '../lib/api'
import { getUserFriendlyErrorMessage } from '../lib/errors'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

interface AuthContextValue extends AuthState {
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null })

  const refreshUser = useCallback(async () => {
    try {
      // api.ts ya desenvuelve el sobre { success, data }: aquí llega el User directo.
      const user = await api.get<User>('/api/auth/me')
      setState({ user, loading: false, error: null })
    } catch (err: unknown) {
      const e = err as { statusCode?: number }
      if (e?.statusCode === 401) {
        // Sin sesión: estado normal (no es un error para mostrar)
        setState({ user: null, loading: false, error: null })
      } else {
        setState({ user: null, loading: false, error: getUserFriendlyErrorMessage(err) })
      }
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {}
    setState({ user: null, loading: false, error: null })
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
