import { useEffect, useState } from 'react'
import ContractConstellation from './contract-constellation'
import AdminDashboard from './monitoring/AdminDashboard'

type AppRoute = 'main' | 'admin'

function getRouteFromHash(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return hash === 'admin' ? 'admin' : 'main'
}

function App() {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromHash())

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash())
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash) {
      window.location.hash = '/main'
    }
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    route === 'admin'
      ? <AdminDashboard />
      : (
        <div className="h-screen w-screen overflow-hidden bg-slate-950">
          <ContractConstellation />
        </div>
      )
  )
}

export default App
