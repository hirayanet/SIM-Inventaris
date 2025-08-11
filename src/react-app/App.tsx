import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router";
import { AuthProvider, useAuth } from "@/react-app/hooks/useAuth";
import Layout from "@/react-app/components/Layout";
import Login from "@/react-app/pages/Login";
import Dashboard from "@/react-app/pages/Dashboard";
import Inventaris from "@/react-app/pages/Inventaris";
import Obat from "@/react-app/pages/Obat";
import Laporan from "@/react-app/pages/Laporan";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/inventaris" element={
        <ProtectedRoute>
          <Inventaris />
        </ProtectedRoute>
      } />
      <Route path="/obat" element={
        <ProtectedRoute>
          <Obat />
        </ProtectedRoute>
      } />
      <Route path="/laporan" element={
        <ProtectedRoute>
          <Laporan />
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute>
          <div>Users Page (Coming Soon)</div>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
