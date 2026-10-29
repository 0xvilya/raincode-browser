import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import type { Bookmark, Visit } from "../shared/contracts";
import {
  completedDomain,
  displayedAddress,
  localSuggestions,
} from "./omniboxHelpers";

export function Omnibox({
  url,
  tabId,
  inputRef,
  history,
  bookmarks,
  label,
  suggestionLabel,
  leading,
  trailing,
  focusRequest,
  onNavigate,
  onSuggestions,
}: {
  url: string;
  tabId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  history: Visit[];
  bookmarks: Bookmark[];
  label: string;
  suggestionLabel: string;
  leading: ReactNode;
  trailing: ReactNode;
  focusRequest: { serial: number; search: boolean };
  onNavigate: (value: string, newTab: boolean) => boolean | void;
  onSuggestions: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState(displayedAddress(url));
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const composing = useRef(false);
  const editing = useRef(false);
  const pending = useRef(false);
  const lastTab = useRef(tabId);
  const lastUrl = useRef(url);
  const suggestions =
    focused && !dismissed ? localSuggestions(draft, history, bookmarks) : [];
  useEffect(() => {
    const switched = lastTab.current !== tabId;
    const navigated = lastUrl.current !== url;
    if (switched || (!editing.current && (!pending.current || navigated))) {
      setDraft(displayedAddress(url));
      pending.current = false;
    }
    if (switched) {
      editing.current = false;
      setDismissed(true);
      setSelected(-1);
    }
    lastTab.current = tabId;
    lastUrl.current = url;
  }, [url, tabId]);
  useEffect(() => {
    if (!focusRequest.serial) return;
    inputRef.current?.focus();
    editing.current = true;
    if (focusRequest.search) setDraft("");
    else inputRef.current?.select();
    setDismissed(false);
  }, [focusRequest, inputRef]);
  useEffect(() => {
    onSuggestions(suggestions.length > 0);
  }, [suggestions.length, onSuggestions]);
  const navigate = (value: string, newTab: boolean) => {
    if (!value.trim()) return;
    pending.current = true;
    editing.current = false;
    setDismissed(true);
    setSelected(-1);
    if (onNavigate(value, newTab) === false) {
      pending.current = false;
      setDraft(displayedAddress(url));
    }
    inputRef.current?.blur();
  };
  return (
    <div className="omnibox-wrap">
      <div className="addressbar">
        {leading}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={suggestions.length ? "omnibox-suggestions" : undefined}
          aria-activedescendant={
            selected >= 0 && suggestions[selected]
              ? `omnibox-option-${selected}`
              : undefined
          }
          placeholder={label}
          value={draft}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onFocus={() => {
            setFocused(true);
            editing.current = true;
          }}
          onBlur={() => {
            setFocused(false);
            editing.current = false;
            if (!pending.current) setDraft(displayedAddress(url));
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            editing.current = true;
            pending.current = false;
            setSelected(-1);
            setDismissed(false);
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            setDraft(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (
              composing.current ||
              event.nativeEvent.isComposing ||
              event.keyCode === 229
            )
              return;
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              pending.current = false;
              setDraft(displayedAddress(url));
              setDismissed(true);
              setSelected(-1);
              inputRef.current?.blur();
            } else if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              const value =
                selected >= 0 && suggestions[selected]
                  ? suggestions[selected].url
                  : draft;
              navigate(
                event.ctrlKey || event.metaKey ? completedDomain(value) : value,
                event.altKey,
              );
            } else if (
              (event.key === "ArrowDown" || event.key === "ArrowUp") &&
              suggestions.length
            ) {
              event.preventDefault();
              setSelected((current) => {
                if (current < 0)
                  return event.key === "ArrowDown" ? 0 : suggestions.length - 1;
                return (
                  (current +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    suggestions.length) %
                  suggestions.length
                );
              });
            }
          }}
        />
        {trailing}
      </div>
      {suggestions.length > 0 && (
        <div
          id="omnibox-suggestions"
          className="omnibox-suggestions"
          role="listbox"
          aria-label={suggestionLabel}
        >
          {suggestions.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={selected === index}
              id={`omnibox-option-${index}`}
              key={item.url}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => navigate(item.url, false)}
            >
              <strong>{item.title}</strong>
              <small>{item.url}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
