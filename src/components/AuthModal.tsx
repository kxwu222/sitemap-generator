import { useState } from 'react';
import { signIn, signUp } from '../services/authService';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void; // Kept for type compatibility but not used (modal only closes on successful auth)
  onSuccess: () => void;
}

export function AuthModal({ isOpen, onSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const { user, error: signInError } = await signIn(email, password);
        if (signInError) {
          // Convert technical error messages to user-friendly ones
          let errorMessage = signInError.message || 'Failed to sign in';
          if (errorMessage.toLowerCase().includes('invalid login credentials') || 
              errorMessage.toLowerCase().includes('invalid credentials')) {
            errorMessage = 'Email or password is incorrect. Please try again.';
          } else if (errorMessage.toLowerCase().includes('email not confirmed')) {
            errorMessage = 'Please check your email and verify your account before signing in.';
          } else if (errorMessage.toLowerCase().includes('too many requests')) {
            errorMessage = 'Too many login attempts. Please wait a moment and try again.';
          }
          setError(errorMessage);
          setLoading(false);
          return;
        }
        if (user) {
          setLoading(false);
          resetForm();
          onSuccess();
        }
      } else {
        // Validate password match
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }

        const { user, error: signUpError } = await signUp(email, password);
        if (signUpError) {
          // Convert technical error messages to user-friendly ones
          let errorMessage = signUpError.message || 'Failed to sign up';
          if (errorMessage.toLowerCase().includes('user already registered') ||
              errorMessage.toLowerCase().includes('email already registered')) {
            errorMessage = 'This email is already registered. Please sign in instead.';
          } else if (errorMessage.toLowerCase().includes('password')) {
            errorMessage = 'Password is too weak. Please use a stronger password.';
          } else if (errorMessage.toLowerCase().includes('email')) {
            errorMessage = 'Please enter a valid email address.';
          }
          setError(errorMessage);
          setLoading(false);
          return;
        }
        if (user) {
          setLoading(false);
          setError('Registration successful! Please check your email to verify your account.');
          // Auto switch to login after successful registration
          setTimeout(() => {
            setIsLogin(true);
            resetForm();
          }, 2000);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const handleSwitchMode = () => {
    setIsLogin(!isLogin);
    resetForm();
  };

  return (
    <>
      <style>{`
        @keyframes moveHorizontal {
          0% {
            transform: translateX(-50%) translateY(-10%);
          }
          50% {
            transform: translateX(50%) translateY(10%);
          }
          100% {
            transform: translateX(-50%) translateY(-10%);
          }
        }
        @keyframes moveInCircle {
          0% {
            transform: rotate(0deg);
          }
          50% {
            transform: rotate(180deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        @keyframes moveVertical {
          0% {
            transform: translateY(-50%);
          }
          50% {
            transform: translateY(50%);
          }
          100% {
            transform: translateY(-50%);
          }
        }
        .gradient-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.7;
        }
        .gradient-blob-1 {
          background: radial-gradient(circle, rgba(255, 165, 0, 0.6), rgba(255, 140, 105, 0.5));
          width: 600px;
          height: 600px;
          animation: moveVertical 30s ease infinite;
        }
        .gradient-blob-2 {
          background: radial-gradient(circle, rgba(135, 206, 250, 0.6), rgba(74, 144, 226, 0.5));
          width: 550px;
          height: 550px;
          animation: moveInCircle 20s reverse infinite;
        }
        .gradient-blob-3 {
          background: radial-gradient(circle, rgba(255, 192, 203, 0.6), rgba(255, 182, 193, 0.5));
          width: 500px;
          height: 500px;
          animation: moveInCircle 40s linear infinite;
        }
        .gradient-blob-4 {
          background: radial-gradient(circle, rgba(173, 216, 230, 0.6), rgba(135, 206, 235, 0.5));
          width: 550px;
          height: 550px;
          animation: moveHorizontal 40s ease infinite;
        }
        .gradient-blob-5 {
          background: radial-gradient(circle, rgba(255, 218, 185, 0.6), rgba(255, 182, 193, 0.5));
          width: 450px;
          height: 450px;
          animation: moveInCircle 20s ease infinite;
        }
        .gradient-background {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255, 248, 240, 0.9), rgba(240, 248, 255, 0.9));
        }
      `}</style>
      <div 
        className="fixed inset-0 z-[999] flex items-center justify-center p-4 overflow-hidden"
        style={{ backgroundColor: '#FFF8F0' }}
      >
        {/* Base warm light background */}
        <div className="gradient-background"></div>
        
        {/* Multiple moving gradient blobs - Aceternity style */}
        <div className="gradient-blob gradient-blob-1" style={{ top: '10%', left: '10%' }}></div>
        <div className="gradient-blob gradient-blob-2" style={{ top: '60%', right: '10%' }}></div>
        <div className="gradient-blob gradient-blob-3" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}></div>
        <div className="gradient-blob gradient-blob-4" style={{ bottom: '20%', left: '20%' }}></div>
        <div className="gradient-blob gradient-blob-5" style={{ top: '30%', right: '30%' }}></div>
        
        {/* Soft warm overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50/30 to-blue-50/30"></div>
        
        {/* App Name and Description - Above Modal */}
        <div className="absolute top-40 left-1/2 transform -translate-x-1/2 z-10 text-center mb-10 px-20">
          <h1 className="text-4xl font-bold text-gray-900 mb-2" style={{ 
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            Sitemap Generator
          </h1>
          <p className="text-md text-gray-800 mt-4 max-w-md mx-auto leading-relaxed">
            Visualise the website structure with interactive sitemaps
          </p>
        </div>
        
        <div 
          className="w-full max-w-md relative z-10 backdrop-blur-md rounded-2xl shadow-xl border border-white/30"
          style={{ 
            backgroundColor: 'rgba(255, 252, 248, 0.95)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.3)'
          }}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-orange-100/50">
            <h2 className="text-2xl font-semibold text-gray-800" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {isLogin ? 'Sign In' : 'Sign Up'}
            </h2>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className={`p-4 rounded-2xl text-sm ${
              error.includes('successful') 
                ? 'bg-green-50/80 text-green-800 border border-green-200/50 backdrop-blur-sm' 
                : 'bg-red-50/80 text-red-800 border border-red-200/50 backdrop-blur-sm'
            }`}>
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-orange-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 bg-white/80 backdrop-blur-sm transition-all placeholder:text-gray-400"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 border border-orange-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 bg-white/80 backdrop-blur-sm transition-all placeholder:text-gray-400"
              placeholder={isLogin ? "Enter your password" : "At least 6 characters"}
            />
          </div>

          {!isLogin && (
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 border border-orange-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 bg-white/80 backdrop-blur-sm transition-all placeholder:text-gray-400"
                placeholder="Confirm your password"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-gradient-to-r from-[#CB6015] to-[#FF8C69] hover:from-[#CC5500] hover:to-[#FF7F50] text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-orange-500/30 hover:shadow-md hover:shadow-orange-500/40 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? 'Loading...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>

          <div className="text-center text-sm text-gray-600 pt-2">
            {isLogin ? (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={handleSwitchMode}
                  className="text-[#CB6015] hover:text-[#CC5500] font-medium transition-colors hover:underline decoration-2 underline-offset-2"
                >
                  Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={handleSwitchMode}
                  className="text-[#CB6015] hover:text-[#CC5500] font-medium transition-colors hover:underline decoration-2 underline-offset-2"
                >
                  Sign In
                </button>
              </>
            )}
          </div>
        </form>
        </div>
      </div>
    </>
  );
}

