const { Pool } = require('pg');
const { nanoid } = require('nanoid');
const InvariantError = require('../../exceptions/InvariantError');
const NotFoundError = require('../../exceptions/NotFoundError');
const ClientError = require('../../exceptions/ClientError');

class AlbumsService {
  constructor(cacheService) {
    this._pool = new Pool();
    this._cacheService = cacheService;
  }

  async addAlbum({ name, year, cover }) {
    const id = `album-${nanoid(16)}`;

    const query = {
      text: 'INSERT INTO albums VALUES($1, $2, $3, $4) RETURNING id',
      values: [id, name, year, cover],
    };

    const result = await this._pool.query(query);

    if (!result.rows[0].id) {
      throw new InvariantError('Album gagal ditambahkan');
    }

    return result.rows[0].id;
  }

  async getAlbumById(id) {
    const query = {
      text: 'SELECT * FROM albums WHERE id = $1',
      values: [id],
    };
    const result = await this._pool.query(query);

    if (!result.rows.length) {
      throw new NotFoundError('Album tidak ditemukan');
    }

    const listSongs = await this._pool.query({
      text: 'SELECT id, title, performer FROM songs WHERE album_id = $1',
      values: [id],
    });

    return {
      ...result.rows[0],
      coverUrl: result.rows[0].cover,
      songs: listSongs.rows,
    };
  }

  async editAlbumById(id, {
    name, year,
  }) {
    const query = {
      text: 'UPDATE albums SET name = $1, year = $2 WHERE id = $3 RETURNING id',
      values: [name, year, id],
    };

    const result = await this._pool.query(query);

    if (!result.rows.length) {
      throw new NotFoundError('Gagal memperbarui album. Id tidak ditemukan');
    }
  }

  async deleteAlbumById(id) {
    const query = {
      text: 'DELETE FROM albums WHERE id = $1 RETURNING id',
      values: [id],
    };

    const result = await this._pool.query(query);

    if (!result.rows.length) {
      throw new NotFoundError('Album gagal dihapus. Id tidak ditemukan');
    }
  }

  async addAlbumCover(id, path) {
    const query = {
      text: 'UPDATE albums SET cover = $1 WHERE id = $2 RETURNING id',
      values: [path, id],
    };

    const result = await this._pool.query(query);

    if (!result.rows.length) {
      throw new NotFoundError('Cover gagal ditambahkan, album tidak ditemukan');
    }
  }

  async addLikesToAlbum(album_id, user_id) {
    const id = `like-${nanoid(16)}`;

    const query = {
      text: 'INSERT INTO user_album_likes VALUES($1, $2, $3) RETURNING id',
      values: [id, user_id, album_id],
    };
    const result = await this._pool.query(query);

    if (!result.rows[0].id) {
      throw new InvariantError('Gagal menyukai album');
    }

    await this._cacheService.delete(`album-likes:${album_id}`);

    return result.rows[0].id;
  }

  async getAlbumLikes(albumId) {
    try {
      const result = await this._cacheService.get(`album-likes:${albumId}`);
      return {
        cache: true,
        likes: JSON.parse(result),
      };
    } catch (error) {
      const query = {
        text: 'SELECT * FROM user_album_likes WHERE album_id = $1',
        values: [albumId],
      };

      const result = await this._pool.query(query);

      if (!result.rows.length) {
        throw new NotFoundError('Album belum memiliki like');
      }

      await this._cacheService.set(`album-likes:${albumId}`, JSON.stringify(result.rows.length));

      return { cache: false, likes: result.rows.length };
    }
  }

  async deleteLike(albumId, userId) {
    const query = {
      text: 'DELETE FROM user_album_likes WHERE user_id = $1 AND album_id = $2 RETURNING id',
      values: [userId, albumId],
    };

    const result = await this._pool.query(query);

    if (!result.rows.length) {
      throw new NotFoundError('Like gagal dihapus. Id tidak ditemukan');
    }

    await this._cacheService.delete(`album-likes:${albumId}`);
  }

  async verifyUserLiked(albumId, userId) {
    // verify album exist
    const albumQuery = {
      text: 'SELECT * FROM albums WHERE id = $1',
      values: [albumId],
    };
    const albumResult = await this._pool.query(albumQuery);

    if (!albumResult.rows.length) {
      throw new NotFoundError('Album tidak ditemukan');
    }

    const query = {
      text: 'SELECT * FROM user_album_likes WHERE album_id = $1 AND user_id = $2',
      values: [albumId, userId],
    };

    const result = await this._pool.query(query);

    if (result.rows.length) {
      throw new ClientError('Anda sudah menyukai album ini');
    }
  }
}

module.exports = AlbumsService;
