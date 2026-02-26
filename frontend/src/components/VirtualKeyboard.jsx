import { useState, useEffect } from 'react';

/**
 * Virtual Keyboard component for secure TOTP entry.
 * Randomizes digit positions to prevent keylogger attacks.
 *
 * Supports TWO usage patterns:
 *   1) Self-contained: <VirtualKeyboard value={str} onChange={fn} maxLength={6} />
 *   2) Callback-based: <VirtualKeyboard onKeyPress={fn} onBackspace={fn} onClear={fn} />
 */
export default function VirtualKeyboard({
  // Self-contained mode props
  value,
  onChange,
  maxLength = 6,
  // Callback mode props
  onKeyPress,
  onBackspace,
  onClear,
}) {
  const [shuffledDigits, setShuffledDigits] = useState([]);
  const [usePhysical, setUsePhysical] = useState(false);

  // Determine mode: self-contained if value+onChange provided
  const selfContained = typeof value === 'string' && typeof onChange === 'function';

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

  const handleKeyPress = (digit) => {
    if (selfContained) {
      if (value.length < maxLength) onChange(value + digit);
    } else if (onKeyPress) {
      onKeyPress(digit);
    }
  };

  const handleBackspace = () => {
    if (selfContained) {
      onChange(value.slice(0, -1));
    } else if (onBackspace) {
      onBackspace();
    }
  };

  const handleClear = () => {
    if (selfContained) {
      onChange('');
    } else if (onClear) {
      onClear();
    }
    shuffleDigits();
  };

  const handlePhysicalInput = (e) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, maxLength);
    if (selfContained) {
      onChange(cleaned);
    }
  };

  const currentValue = selfContained ? value : '';

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-500 text-center mb-3">
        Secure Entry (randomized keyboard)
      </p>

      {/* Digit display boxes */}
      {selfContained && (
        <div className="flex justify-center mb-3">
          <div className="flex space-x-2">
            {Array.from({ length: maxLength }).map((_, i) => (
              <div
                key={i}
                className={`w-10 h-12 flex items-center justify-center text-xl font-bold border-2 rounded-lg transition ${
                  currentValue[i]
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-300 bg-white text-gray-400'
                }`}
              >
                {currentValue[i] || '·'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Physical keyboard input */}
      {usePhysical && selfContained ? (
        <div className="mb-3">
          <input
            type="text"
            value={currentValue}
            onChange={handlePhysicalInput}
            maxLength={maxLength}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-center text-lg tracking-widest"
            placeholder={'0'.repeat(maxLength)}
            autoFocus
          />
        </div>
      ) : (
        /* Virtual keyboard grid */
        <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
          {shuffledDigits.slice(0, 9).map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeyPress(digit)}
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
          {shuffledDigits.length > 9 && (
            <button
              type="button"
              onClick={() => handleKeyPress(shuffledDigits[9])}
              className="bg-white border border-gray-200 hover:bg-primary-50 hover:border-primary-300 text-gray-800 font-semibold py-3 rounded-lg text-lg transition shadow-sm active:scale-95"
            >
              {shuffledDigits[9]}
            </button>
          )}
          <button
            type="button"
            onClick={handleBackspace}
            className="bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 text-yellow-700 font-medium py-3 rounded-lg text-sm transition"
          >
            ← Back
          </button>
        </div>
      )}

      {/* Toggle keyboard type */}
      <div className="flex items-center justify-center mt-3">
        <button
          type="button"
          onClick={() => setUsePhysical(!usePhysical)}
          className="text-xs text-gray-500 hover:text-primary-600 underline"
        >
          {usePhysical ? 'Use virtual keyboard' : 'Use physical keyboard'}
        </button>
      </div>
    </div>
  );
}
