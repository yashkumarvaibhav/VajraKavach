import { useState, useEffect, useMemo } from 'react';

/**
 * Virtual Keyboard component for secure TOTP entry.
 * Randomizes digit positions to prevent keylogger attacks.
 */
export default function VirtualKeyboard({ onKeyPress, onBackspace, onClear }) {
  const [shuffledDigits, setShuffledDigits] = useState([]);

  // Shuffle digits on mount and on each clear
  const shuffleDigits = () => {
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    setShuffledDigits(digits);
  };

  useEffect(() => {
    shuffleDigits();
  }, []);

  const handleClear = () => {
    onClear();
    shuffleDigits(); // Re-shuffle after clear
  };

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-500 text-center mb-3">Virtual Keyboard (randomized for security)</p>
      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {shuffledDigits.slice(0, 9).map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => onKeyPress(digit)}
            className="bg-white border border-gray-200 hover:bg-primary-50 hover:border-primary-300 text-gray-800 font-semibold py-3 rounded-lg text-lg transition shadow-sm active:scale-95"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={handleClear}
          className="bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 font-medium py-3 rounded-lg text-sm transition"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => onKeyPress(shuffledDigits[9])}
          className="bg-white border border-gray-200 hover:bg-primary-50 hover:border-primary-300 text-gray-800 font-semibold py-3 rounded-lg text-lg transition shadow-sm active:scale-95"
        >
          {shuffledDigits[9]}
        </button>
        <button
          type="button"
          onClick={onBackspace}
          className="bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 text-yellow-700 font-medium py-3 rounded-lg text-sm transition"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
