import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Wallets from './pages/Wallets';
import Config from './pages/Config';
import CodeViewer from './pages/CodeViewer';
import Messages from './pages/Messages';
import WalletTransactions from './pages/WalletTransactions';
import Transactions from './pages/Transactions';
import DeletedTransactions from './pages/DeletedTransactions';
import Layout from './components/Layout';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="wallets" element={<Wallets />} />
          <Route path="config" element={<Config />} />
          <Route path="code" element={<CodeViewer />} />
          <Route path="messages" element={<Messages />} />
          <Route path="wallet-transactions" element={<WalletTransactions />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="deleted-transactions" element={<DeletedTransactions />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

