import { useRef, useState } from 'react';
import type { SpotKind } from '../../types/database';
import { errorMessage } from '../../lib/errors';
import type { MenuImage, SpotMenuWithAuthor } from '../menu/api';
import LocationPicker, { type PickedLocation } from './LocationPicker';

export interface SpotFormValues {
  name: string;
  lat: number;
  lng: number;
  kind: SpotKind;
  menuText: string;
}

// Default 종류 options when a tour list is not supplied (e.g. in isolation /
// tests). In the app these come from the per-tour spot_kinds list (migration 10).
const DEFAULT_KINDS = ['빵집', '음식점'];

interface SpotFormProps {
  onSubmit: (values: SpotFormValues) => Promise<void> | void;
  onCancel: () => void;
  // Prefill for editing an existing spot. Menu is added separately (F4).
  initial?: {
    name?: string;
    lat?: number;
    lng?: number;
    kind?: SpotKind;
  };
  // Selectable 종류 options for this tour, and a persister for the "종류 추가"
  // button. Both optional so the form still works standalone.
  kinds?: string[];
  onAddKind?: (name: string) => Promise<void> | void;
  // Menu management (edit mode). When `onAddMenu` is supplied the form shows the
  // spot's existing signature menus with per-menu delete + an "add menu" input
  // that registers immediately (REQ-F4). In add mode (new spot, no onAddMenu) the
  // single "추천 메뉴" field below is used instead and stored on save.
  menus?: SpotMenuWithAuthor[];
  // Register a new menu. `files` are optional photos to attach to it (REQ-F4).
  onAddMenu?: (text: string, files: File[]) => Promise<void> | void;
  onDeleteMenu?: (menuId: string) => Promise<void> | void;
  // Attach more photos to an existing menu / detach one (REQ-F4 images).
  onAddImagesToMenu?: (
    menu: SpotMenuWithAuthor,
    files: File[],
  ) => Promise<void> | void;
  onRemoveImage?: (
    menu: SpotMenuWithAuthor,
    image: MenuImage,
  ) => Promise<void> | void;
  // Used to gate which menus show a delete control (author or owner — RLS is the
  // real guard; this just hides controls the user cannot use).
  currentUserId?: string;
  isOwner?: boolean;
}

// Spot registration / edit form (REQ-F1-001 data + REQ-F4-001 menu fields).
// Location capture (A8): the user opens an interactive Kakao map picker
// (LocationPicker) and either taps the map or searches for a place to set the
// real coordinate. Submit is blocked until a coordinate exists (AC-F1-06).
export default function SpotForm({
  onSubmit,
  onCancel,
  initial,
  kinds,
  onAddKind,
  menus,
  onAddMenu,
  onDeleteMenu,
  onAddImagesToMenu,
  onRemoveImage,
  currentUserId,
  isOwner,
}: SpotFormProps) {
  // Edit mode manages the spot's menu list inline (add/delete immediately);
  // add mode keeps the single "추천 메뉴" field stored on save.
  const manageMenus = typeof onAddMenu === 'function';
  const kindOptions = kinds && kinds.length > 0 ? kinds : DEFAULT_KINDS;
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<SpotKind>(
    initial?.kind ?? kindOptions[0] ?? '빵집',
  );
  // Inline "종류 추가" state: when adding, a small text input + 확인 replaces the
  // dropdown focus so a new category can be typed and persisted.
  const [addingKind, setAddingKind] = useState(false);
  const [newKind, setNewKind] = useState('');
  const [menuText, setMenuText] = useState('');
  // Edit-mode "add a signature menu" input (registers immediately via onAddMenu).
  const [addMenuText, setAddMenuText] = useState('');
  // New-menu photo picker: uncontrolled file input read on "메뉴 추가".
  const newMenuFilesRef = useRef<HTMLInputElement | null>(null);
  const [newMenuFileCount, setNewMenuFileCount] = useState(0);
  // Disable menu controls while an image upload is in flight.
  const [busyMenu, setBusyMenu] = useState(false);
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    initial?.lat != null && initial?.lng != null
      ? { lat: initial.lat, lng: initial.lng }
      : null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Apply a coordinate chosen in the interactive picker. If the picker returned
  // a place name and the name field is still empty, prefill it (optional, A8).
  function handlePicked(location: PickedLocation) {
    setCoord({ lat: location.lat, lng: location.lng });
    if (location.name && name.trim().length === 0) {
      setName(location.name);
    }
    setError(null);
    setPickerOpen(false);
  }

  // Confirm the "종류 추가" inline input: persist the new option (if a persister
  // is supplied) and select it. Not a form submit — preventDefault keeps the
  // surrounding <form> from submitting on Enter.
  async function handleAddKind() {
    const value = newKind.trim();
    if (value.length === 0) return;
    try {
      if (!kindOptions.includes(value)) {
        await onAddKind?.(value);
      }
      setKind(value);
      setNewKind('');
      setAddingKind(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // Register a new signature menu immediately (edit mode), with any chosen
  // photos. A menu may be added with photos only (no text) too. Not a form
  // submit — preventDefault on Enter keeps the surrounding <form> from submitting.
  async function handleAddMenu() {
    const value = addMenuText.trim();
    const files = Array.from(newMenuFilesRef.current?.files ?? []);
    if (value.length === 0 && files.length === 0) return;
    setBusyMenu(true);
    try {
      await onAddMenu?.(value, files);
      setAddMenuText('');
      setNewMenuFileCount(0);
      if (newMenuFilesRef.current) newMenuFilesRef.current.value = '';
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyMenu(false);
    }
  }

  async function handleDeleteMenu(menuId: string) {
    try {
      await onDeleteMenu?.(menuId);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // Attach more photos to an existing menu.
  async function handleAddImages(menu: SpotMenuWithAuthor, files: File[]) {
    if (files.length === 0) return;
    setBusyMenu(true);
    try {
      await onAddImagesToMenu?.(menu, files);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyMenu(false);
    }
  }

  // Detach one photo from a menu.
  async function handleRemoveImage(menu: SpotMenuWithAuthor, image: MenuImage) {
    try {
      await onRemoveImage?.(menu, image);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coord) {
      setError('지도에서 위치를 먼저 선택하세요.');
      return;
    }
    if (name.trim().length === 0) {
      setError('장소 이름을 입력하세요.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        lat: coord.lat,
        lng: coord.lng,
        // Never send a blank category (DB requires 1-50 chars); fall back to 빵집.
        kind: kind.trim() || '빵집',
        menuText: menuText.trim(),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="spot-form" onSubmit={handleSubmit}>
      <label>
        이름
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label>
        종류
        {/* Per-tour options (migration 10). "종류 추가" appends a new option to
            the tour's list so every member sees it. The selected kind is always
            present in the list even if it was later removed from the tour. */}
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {(kindOptions.includes(kind)
            ? kindOptions
            : [kind, ...kindOptions]
          ).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      {addingKind ? (
        <div className="spot-form-add-kind">
          <input
            type="text"
            value={newKind}
            data-testid="new-kind-input"
            onChange={(e) => setNewKind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAddKind();
              }
            }}
            placeholder="새 종류 (예: 카페)"
            aria-label="새 종류 이름"
          />
          <button type="button" data-testid="confirm-add-kind" onClick={handleAddKind}>
            확인
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setAddingKind(false);
              setNewKind('');
            }}
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="link-button spot-form-add-kind-toggle"
          data-testid="add-kind"
          onClick={() => setAddingKind(true)}
        >
          + 종류 추가
        </button>
      )}

      <div className="spot-form-location">
        <button
          type="button"
          data-testid="pin-here"
          onClick={() => setPickerOpen(true)}
        >
          지도에서 위치 선택
        </button>
        {coord && (
          <span className="muted" data-testid="picked-coord">
            {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
          </span>
        )}
      </div>

      {pickerOpen && (
        <LocationPicker
          initial={coord ?? undefined}
          onConfirm={handlePicked}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      {manageMenus ? (
        // Edit mode: manage the spot's signature menus inline (REQ-F4).
        <div className="spot-form-menus" data-testid="menu-manager">
          <span className="label-text">시그니처 메뉴</span>
          {(menus?.length ?? 0) === 0 ? (
            <p className="muted">등록된 메뉴가 없습니다.</p>
          ) : (
            <ul className="spot-form-menu-list">
              {menus!.map((m) => {
                const mine = isOwner || m.author_id === currentUserId;
                const images = m.images ?? [];
                return (
                  <li key={m.id}>
                    <div className="spot-menu-row">
                      <span className="spot-menu-text">
                        {m.menu_text || '(사진)'}
                      </span>
                      <span className="muted">
                        {' '}
                        — {m.author?.display_name ?? m.author_id}
                      </span>
                      {mine && (
                        <button
                          type="button"
                          className="menu-delete"
                          aria-label={`메뉴 삭제: ${m.menu_text || '사진 메뉴'}`}
                          title="삭제"
                          onClick={() => void handleDeleteMenu(m.id)}
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      )}
                    </div>

                    {(images.length > 0 || mine) && (
                      <div className="menu-thumbs">
                        {images.map((img) => (
                          <span className="menu-thumb" key={img.path}>
                            <img src={img.url} alt={m.menu_text} loading="lazy" />
                            {mine && (
                              <button
                                type="button"
                                className="menu-thumb-remove"
                                aria-label={`사진 삭제: ${m.menu_text}`}
                                title="사진 삭제"
                                onClick={() => void handleRemoveImage(m, img)}
                              >
                                <span aria-hidden="true">×</span>
                              </button>
                            )}
                          </span>
                        ))}
                        {mine && (
                          <label className="menu-thumb-add" title="사진 추가">
                            <span aria-hidden="true">＋</span>
                            <span className="sr-only">사진 추가</span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              disabled={busyMenu}
                              aria-label={`사진 추가: ${m.menu_text}`}
                              onChange={(e) => {
                                const fs = Array.from(e.target.files ?? []);
                                e.target.value = '';
                                void handleAddImages(m, fs);
                              }}
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="spot-form-add-menu">
            <input
              type="text"
              value={addMenuText}
              data-testid="add-menu-input"
              onChange={(e) => setAddMenuText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAddMenu();
                }
              }}
              placeholder="새 시그니처 메뉴"
              aria-label="새 시그니처 메뉴"
            />
            <label className="menu-file-pick" title="사진 첨부">
              <span aria-hidden="true">🖼</span>
              <span className="sr-only">사진 첨부</span>
              <input
                ref={newMenuFilesRef}
                type="file"
                accept="image/*"
                multiple
                data-testid="add-menu-files"
                aria-label="새 메뉴 사진 첨부"
                onChange={(e) =>
                  setNewMenuFileCount(e.target.files?.length ?? 0)
                }
              />
            </label>
            <button
              type="button"
              data-testid="add-menu"
              disabled={busyMenu}
              onClick={() => void handleAddMenu()}
            >
              메뉴 추가
            </button>
          </div>
          {newMenuFileCount > 0 && (
            <span className="muted" data-testid="add-menu-file-count">
              사진 {newMenuFileCount}장 선택됨
            </span>
          )}
        </div>
      ) : (
        <label>
          추천 메뉴 (선택)
          <input
            type="text"
            value={menuText}
            onChange={(e) => setMenuText(e.target.value)}
            placeholder="시그니처 메뉴 (비워둬도 됩니다)"
          />
        </label>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="spot-form-actions">
        <button type="submit" disabled={submitting}>
          저장
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  );
}
