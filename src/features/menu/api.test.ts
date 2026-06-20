import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the vi.mock factory (which is itself hoisted above imports) can
// reference these without "Cannot access before initialization".
const { storageUpload, storageRemove, getPublicUrl, storageFrom } = vi.hoisted(
  () => {
    const storageUpload = vi.fn();
    const storageRemove = vi.fn();
    const getPublicUrl = vi.fn();
    const storageFrom = vi.fn(() => ({
      upload: storageUpload,
      remove: storageRemove,
      getPublicUrl,
    }));
    return { storageUpload, storageRemove, getPublicUrl, storageFrom };
  },
);

vi.mock('../../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
      storage: { from: storageFrom },
    },
  };
});

import { supabase } from '../../lib/supabase';
import {
  addSpotMenu,
  deleteSpotMenu,
  listSpotMenus,
  listSpotMenusForTour,
  removeImageObjects,
  updateMenuImages,
  uploadMenuImage,
} from './api';

// Minimal File stub: vitest/jsdom provides File, but we keep size/type explicit.
function fakeFile(name: string, type: string, size: number): File {
  const f = new File([new Uint8Array(Math.min(size, 8))], name, { type });
  // Override size for the size-limit test without allocating huge buffers.
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'in'];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  (chain as unknown as { then: PromiseLike<unknown>['then'] }).then = (
    onfulfilled,
    onrejected,
  ) => Promise.resolve(result).then(onfulfilled, onrejected);
  return chain;
}

const mockedFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listSpotMenus (REQ-F4-002 / REQ-F4-003 / AC-F4-01..02)', () => {
  it('selects menus for a spot with the contributor profile joined', async () => {
    const rows = [
      {
        id: 'm1',
        spot_id: 's1',
        author_id: 'u1',
        menu_text: '소금빵',
        author: { display_name: 'Alice' },
      },
      {
        id: 'm2',
        spot_id: 's1',
        author_id: 'u2',
        menu_text: '크루아상',
        author: { display_name: 'Bob' },
      },
    ];
    const b = builder({ data: rows, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await listSpotMenus('s1');

    expect(mockedFrom).toHaveBeenCalledWith('spot_menus');
    // contributor profile must be joined for attribution (REQ-F4-003).
    expect(b.select).toHaveBeenCalledWith(
      expect.stringContaining('author:profiles'),
    );
    expect(b.eq).toHaveBeenCalledWith('spot_id', 's1');
    // two distinct contributors are returned.
    expect(result).toHaveLength(2);
    expect(result[0].author?.display_name).toBe('Alice');
    expect(result[1].author?.display_name).toBe('Bob');
  });

  it('returns an empty array when a spot has no menus (REQ-F4-004)', async () => {
    const b = builder({ data: [], error: null });
    mockedFrom.mockReturnValue(b);
    const result = await listSpotMenus('s1');
    expect(result).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    const b = builder({ data: null, error: { message: 'denied' } });
    mockedFrom.mockReturnValue(b);
    await expect(listSpotMenus('s1')).rejects.toThrow('denied');
  });
});

describe('listSpotMenusForTour (REQ-F4-002 / AC-F4-02)', () => {
  it('returns an empty map without querying when there are no spots', async () => {
    const result = await listSpotMenusForTour([]);
    expect(result).toEqual({});
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('groups menus by spot_id across multiple spots', async () => {
    const rows = [
      { id: 'm1', spot_id: 's1', author_id: 'u1', menu_text: '소금빵' },
      { id: 'm2', spot_id: 's1', author_id: 'u2', menu_text: '크루아상' },
      { id: 'm3', spot_id: 's2', author_id: 'u1', menu_text: '파스타' },
    ];
    const b = builder({ data: rows, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await listSpotMenusForTour(['s1', 's2']);

    expect(mockedFrom).toHaveBeenCalledWith('spot_menus');
    expect(b.in).toHaveBeenCalledWith('spot_id', ['s1', 's2']);
    expect(result.s1).toHaveLength(2);
    expect(result.s2).toHaveLength(1);
  });

  it('throws when supabase returns an error', async () => {
    const b = builder({ data: null, error: { message: 'denied' } });
    mockedFrom.mockReturnValue(b);
    await expect(listSpotMenusForTour(['s1'])).rejects.toThrow('denied');
  });
});

describe('addSpotMenu (REQ-F4-001 / AC-F4-01)', () => {
  it('inserts a menu row attributed to the author and returns it', async () => {
    const created = {
      id: 'm3',
      spot_id: 's1',
      author_id: 'u1',
      menu_text: '단팥빵',
    };
    const b = builder({ data: created, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await addSpotMenu({
      spotId: 's1',
      authorId: 'u1',
      menuText: '단팥빵',
    });

    expect(mockedFrom).toHaveBeenCalledWith('spot_menus');
    expect(b.insert).toHaveBeenCalledWith({
      spot_id: 's1',
      author_id: 'u1',
      menu_text: '단팥빵',
    });
    expect(result).toEqual(created);
  });

  it('allows an empty name for a photo-only menu (the photo is the menu)', async () => {
    const created = { id: 'm9', spot_id: 's1', author_id: 'u1', menu_text: '' };
    const b = builder({ data: created, error: null });
    mockedFrom.mockReturnValue(b);
    const result = await addSpotMenu({
      spotId: 's1',
      authorId: 'u1',
      menuText: '   ',
    });
    // Whitespace is trimmed to '' and the row is inserted (photo-only menu).
    expect(b.insert).toHaveBeenCalledWith({
      spot_id: 's1',
      author_id: 'u1',
      menu_text: '',
    });
    expect(result).toEqual(created);
  });
});

describe('deleteSpotMenu (REQ-F4)', () => {
  it('deletes the menu row by id', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);
    await deleteSpotMenu('m1');
    expect(mockedFrom).toHaveBeenCalledWith('spot_menus');
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith('id', 'm1');
  });

  it('throws when the delete is rejected (RLS: not author/owner)', async () => {
    const b = builder({ data: null, error: { message: 'denied' } });
    mockedFrom.mockReturnValue(b);
    await expect(deleteSpotMenu('m1')).rejects.toThrow('denied');
  });
});

describe('menu image attachments (REQ-F4 images)', () => {
  it('uploads an image and returns { path, url } namespaced by tour + menu', async () => {
    storageUpload.mockResolvedValue({ data: { path: 'x' }, error: null });
    getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://cdn.test/menu-images/t1/m1/x.png' },
    });
    const file = fakeFile('photo.png', 'image/png', 1234);

    const result = await uploadMenuImage(file, { tourId: 't1', menuId: 'm1' });

    expect(storageFrom).toHaveBeenCalledWith('menu-images');
    // Path is namespaced t1/m1/... so objects are attributable + cleanable.
    const [path] = storageUpload.mock.calls[0];
    expect(path).toMatch(/^t1\/m1\//);
    expect(result.url).toContain('https://cdn.test');
    expect(result.path).toMatch(/^t1\/m1\//);
  });

  it('rejects a non-image file before uploading', async () => {
    const file = fakeFile('notes.pdf', 'application/pdf', 100);
    await expect(
      uploadMenuImage(file, { tourId: 't1', menuId: 'm1' }),
    ).rejects.toThrow(/이미지 파일/);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('rejects an oversized image before uploading', async () => {
    const file = fakeFile('huge.png', 'image/png', 9 * 1024 * 1024);
    await expect(
      uploadMenuImage(file, { tourId: 't1', menuId: 'm1' }),
    ).rejects.toThrow(/너무 큽니다/);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('updates the menu images array on spot_menus', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);
    const imgs = [{ path: 'p1', url: 'u1' }];
    await updateMenuImages('m1', imgs);
    expect(mockedFrom).toHaveBeenCalledWith('spot_menus');
    expect(b.update).toHaveBeenCalledWith({ images: imgs });
    expect(b.eq).toHaveBeenCalledWith('id', 'm1');
  });

  it('removes storage objects (best-effort, never throws on failure)', async () => {
    storageRemove.mockRejectedValue(new Error('boom'));
    // Must NOT reject — orphaned object cleanup is non-critical.
    await expect(removeImageObjects(['p1'])).resolves.toBeUndefined();
    expect(storageFrom).toHaveBeenCalledWith('menu-images');
  });
});
