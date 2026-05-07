import React, { useRef, useEffect } from 'react';
import './OTPInput.css';

interface Props {
    value: string;
    onChange: (v: string) => void;
    autoFocus?: boolean;
}

const OTPInput: React.FC<Props> = ({ value, onChange, autoFocus = true }) => {
    const refs = useRef<(HTMLInputElement | null)[]>([]);
    const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

    useEffect(() => {
        if (autoFocus) refs.current[0]?.focus();
    }, [autoFocus]);

    const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value.replace(/\D/g, '');
        if (!v) return;
        const next = digits.map((d, idx) => idx === i ? v.slice(-1) : d).join('');
        onChange(next);
        if (i < 5) refs.current[i + 1]?.focus();
    };

    const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
            e.preventDefault();
            if (digits[i]) {
                onChange(digits.map((d, idx) => idx === i ? '' : d).join(''));
            } else if (i > 0) {
                refs.current[i - 1]?.focus();
                onChange(digits.map((d, idx) => idx === i - 1 ? '' : d).join(''));
            }
        } else if (e.key === 'ArrowLeft' && i > 0) {
            refs.current[i - 1]?.focus();
        } else if (e.key === 'ArrowRight' && i < 5) {
            refs.current[i + 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        onChange(pasted);
        refs.current[Math.min(pasted.length, 5)]?.focus();
    };

    return (
        <div className="otp-boxes" onPaste={handlePaste}>
            {digits.map((d, i) => (
                <React.Fragment key={i}>
                    <input
                        ref={el => { refs.current[i] = el; }}
                        type="text" inputMode="numeric" maxLength={1}
                        value={d} autoComplete="off"
                        onChange={e => handleChange(i, e)}
                        onKeyDown={e => handleKeyDown(i, e)}
                        className={`otp-box${d ? ' otp-filled' : ''}`}
                    />
                    {i === 2 && <span className="otp-sep">—</span>}
                </React.Fragment>
            ))}
        </div>
    );
};

export default OTPInput;
