/**
 * Yoca — spam honeypot field.
 * Invisible and unreachable for people (off-screen, aria-hidden, no tab stop,
 * no autofill); form-filling bots find it and type into it. The value travels
 * as `website` and any content makes the API drop the submission silently.
 */

interface HoneypotProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

export default function Honeypot({ id, value, onChange }: HoneypotProps) {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
    >
      <label htmlFor={id}>Homepage</label>
      <input
        id={id}
        name="homepage"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
