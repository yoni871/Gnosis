import './App.css'
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import StudyPage from './pages/StudyPage';
import SearchResultsPage from './pages/SearchResultsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VerifyPage from './pages/VerifyPage';

function App() {

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>

            {/*
              The homepage is the public landing page. It sets its own
              metadata (LANDING_TITLE / LANDING_DESCRIPTION from
              src/utils/seo.js) and is listed in the sitemap. The Bible
              study reader stays at /bible/:book/:chapter.
            */}
            <Route
              path="/"
              element={<LandingPage />}
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

          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
