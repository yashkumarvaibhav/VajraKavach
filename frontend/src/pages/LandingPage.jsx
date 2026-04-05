import { Link } from 'react-router-dom';
import { Shield, Lock, FileText, Users, CheckCircle, ArrowRight } from 'lucide-react';

const features = [
  {
    icon: Lock,
    title: 'TOTP Two-Factor Auth',
    desc: 'Time-based one-time passwords with virtual keyboard to prevent keylogging attacks.',
  },
  {
    icon: FileText,
    title: 'Encrypted Resumes',
    desc: 'AES-encrypted resume storage with SHA-256 integrity verification and digital signatures.',
  },
  {
    icon: Users,
    title: 'Professional Networking',
    desc: 'End-to-end encrypted messaging with RSA key pairs and connection management.',
  },
  {
    icon: Shield,
    title: 'Tamper-Evident Audit',
    desc: 'Hash-chained audit logs ensure every action is immutably recorded and verifiable.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50">
      {/* Nav */}
      <nav className="flex items-center justify-between max-w-7xl mx-auto px-6 py-5">
        <div className="flex items-center space-x-2">
          <Shield className="h-9 w-9 text-primary-600" />
          <span className="text-2xl font-extrabold tracking-tight text-gray-900">
            Vajra<span className="text-primary-600">Kavach</span>
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            to="/login"
            className="px-5 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 transition"
          >
            Sign In
          </Link>
          <Link
            to="/register"
            className="px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-24 lg:pt-24 lg:pb-32">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center space-x-2 bg-primary-100 text-primary-700 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Lock className="h-4 w-4" />
            <span>Military-Grade Security for Your Career</span>
          </div>
          <h1 className="text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            Secure Job Search &{' '}
            <span className="text-primary-600">Professional Networking</span>
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed mb-10 max-w-2xl mx-auto">
            VajraKavach protects your professional identity with end-to-end encryption,
            TOTP multi-factor authentication, PKI digital signatures, and
            tamper-evident audit logging — so you can focus on your career, not your security.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="flex items-center space-x-2 px-8 py-3.5 text-base font-semibold text-white bg-primary-600 rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-600/25 transition"
            >
              <span>Create Secure Account</span>
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              to="/login"
              className="px-8 py-3.5 text-base font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:border-primary-400 hover:text-primary-600 transition"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <h2 className="text-center text-3xl font-bold text-gray-900 mb-4">
          Security-First Platform
        </h2>
        <p className="text-center text-gray-500 mb-14 max-w-xl mx-auto">
          Every layer of VajraKavach is designed with robust cryptographic primitives
          and defense-in-depth principles.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-primary-200 transition group"
            >
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 rounded-lg mb-4 group-hover:bg-primary-600 transition">
                <f.icon className="h-6 w-6 text-primary-600 group-hover:text-white transition" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="bg-primary-600 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center text-white">
          <h2 className="text-3xl font-bold mb-6">Built for CSE 345/545 — Fundamentals of Computer Security</h2>
          <div className="grid sm:grid-cols-3 gap-8 mt-8">
            {[
              ['Argon2id', 'Password hashing with memory-hard KDF'],
              ['RSA-2048 PKI', 'Per-user key pairs for E2E crypto'],
              ['SHA-256 Chains', 'Tamper-evident immutable audit logs'],
            ].map(([title, desc]) => (
              <div key={title}>
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-primary-200" />
                <h3 className="font-semibold text-lg">{title}</h3>
                <p className="text-sm text-primary-200 mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-sm text-gray-400">
        &copy; {new Date().getFullYear()} VajraKavach — IIIT-Delhi CSE 345/545 Project
      </footer>
    </div>
  );
}
