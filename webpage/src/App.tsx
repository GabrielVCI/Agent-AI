import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ScrollToTop } from '@/components/ScrollToTop'
import LandingPage from '@/pages/LandingPage'
import ComoFuncionaPage from '@/pages/ComoFuncionaPage'
import IndustriasPage from '@/pages/IndustriasPage'
import IndustryPage from '@/pages/IndustryPage'
import IntegracionesPage from '@/pages/IntegracionesPage'
import PreciosPage from '@/pages/PreciosPage'
import ContactoPage from '@/pages/ContactoPage'
import TerminosPage from '@/pages/TerminosPage'
import PrivacidadPage from '@/pages/PrivacidadPage'
import NotFoundPage from '@/pages/NotFoundPage'
import SmokeyCursorDemoPage from '@/pages/SmokeyCursorDemoPage'

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/como-funciona" element={<ComoFuncionaPage />} />
        <Route path="/industrias" element={<IndustriasPage />} />
        <Route path="/industrias/:slug" element={<IndustryPage />} />
        <Route path="/integraciones" element={<IntegracionesPage />} />
        <Route path="/precios" element={<PreciosPage />} />
        <Route path="/contacto" element={<ContactoPage />} />
        <Route path="/terminos" element={<TerminosPage />} />
        <Route path="/privacidad" element={<PrivacidadPage />} />
        {/* Demo interno de efectos (no enlazado desde la navegación) */}
        <Route path="/demo/smokey-cursor" element={<SmokeyCursorDemoPage />} />
        {/* Rutas futuras (multipage): /casos-de-uso */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
