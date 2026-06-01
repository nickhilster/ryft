import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return commands.filter((command) => command.label.toLowerCase().includes(normalizedQuery));
  }, [commands, query]);
  const activeIndex = filteredCommands.length === 0 ? 0 : Math.min(selectedIndex, filteredCommands.length - 1);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Prevent background scroll while the palette is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function runCommand(command: Command | undefined) {
    if (!command || command.disabled) {
      return;
    }

    command.action();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="prompt-modal palette-modal" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          type="search"
          placeholder="Search commands..."
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
              return;
            }

            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelectedIndex((current) => filteredCommands.length === 0 ? 0 : (current + 1) % filteredCommands.length);
              return;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelectedIndex((current) => filteredCommands.length === 0 ? 0 : (current - 1 + filteredCommands.length) % filteredCommands.length);
              return;
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              runCommand(filteredCommands[activeIndex]);
            }
          }}
        />
        <ul className="palette-list">
          {filteredCommands.length === 0 ? (
            <li className="palette-item disabled">No matching commands</li>
          ) : (
            filteredCommands.map((command, index) => (
              <li
                key={command.id}
                className={`palette-item ${index === activeIndex ? 'focused' : ''} ${command.disabled ? 'disabled' : ''}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => runCommand(command)}
              >
                <span>{command.label}</span>
                {command.shortcut && <kbd className="palette-kbd">{command.shortcut}</kbd>}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}