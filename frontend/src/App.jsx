import './App.css'
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import StudyPage from './pages/StudyPage';
import SearchResultsPage from './pages/SearchResultsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VerifyPage from './pages/VerifyPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

function App() {

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>

            {/*
              LANDING PAGE SWAP POINT -- read before changing this route.
              The homepage currently redirects to the reader because the
              landing page does not exist yet. Do NOT remove this
              redirect until the landing page is ready. When it is:
                1. Replace this route's element with <LandingPage />.
                2. Give the landing page its metadata from the
                   LANDING_TITLE / LANDING_DESCRIPTION constants in
                   src/utils/seo.js (index.html already carries them
                   as the site-wide default).
                3. Add "/" to the sitemap: pass ["/"] as extraPaths to
                   buildSitemapXml in scripts/generate-sitemap.js and
                   regenerate public/sitemap.xml. Until then "/" must
                   stay OUT of the sitemap because it redirects.
              The Bible study reader stays at /bible/:book/:chapter
              either way; nothing else in this file changes.
            */}
            <Route
              path="/"
              element={<Navigate to="/bible/Genesis/1" replace />}
            />

            <Route 
              path='/bible/:book/:chapter'
              element={<StudyPage />}
            />

            <Route
              path='/search'
              element={<SearchResultsPage />} 
            />

            <Route
              path='/login' 
              element={<LoginPage />}
            />

            <Route
              path='/register' 
              element={<RegisterPage />}
            />

            <Route
              path='/verify-email'
              element={<VerifyPage />}
            />

            <Route
              path='/forgot-password'
              element={<ForgotPasswordPage />}
            />

            <Route
              path='/reset-password'
              element={<ResetPasswordPage />}
            />

          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
