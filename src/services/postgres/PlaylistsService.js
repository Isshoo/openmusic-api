const { Pool } = require('pg');
const { nanoid } = require('nanoid');
const InvariantError = require('../../exceptions/InvariantError');
const NotFoundError = require('../../exceptions/NotFoundError');
const AuthorizationError = require('../../exceptions/AuthorizationError');

class PlaylistsService {
  constructor(collaborationsService, cacheService) {
    this._pool = new Pool();
    this._collaborationsService = collaborationsService;
    this._cacheService = cacheService;
  }

  async addPlaylist({ name, owner }) {
    const id = `playlist-${nanoid(16)}`;

    const query = {
      text: 'INSERT INTO playlists VALUES($1, $2, $3) RETURNING id',
      values: [id, name, owner],
    };

    const addResult = await this._pool.query(query);

    if (!addResult.rows[0].id) {
      throw new InvariantError('Playlist gagal ditambahkan');
    }

    await this._cacheService.delete(`playlists:${owner}`);

    return addResult.rows[0].id;
  }

  async getPlaylists(owner) {
    try {
      // mendapatkan playlist dari cache
      const result = await this._cacheService.get(`playlists:${owner}`);
      return JSON.parse(result);
    } catch (error) {
      // bila gagal, diteruskan dengan mendapatkan playlist dari database
      const query = {
        text: `SELECT playlists.id, playlists.name, users.username AS username FROM playlists 
      LEFT JOIN collaborations ON collaborations.playlist_id = playlists.id 
      LEFT JOIN users ON users.id = playlists.owner 
      WHERE playlists.owner = $1 OR collaborations.user_id = $1 
      GROUP BY (playlists.id, users.username)`,
        values: [owner],
      };

      const result = await this._pool.query(query);

      // catatan akan disimpan pada cache sebelum fungsi getPlaylists dikembalikan
      await this._cacheService.set(`playlists:${owner}`, JSON.stringify(result));

      return result.rows;
    }
  }

  async deletePlaylistById(id) {
    const query = {
      text: 'DELETE FROM playlists WHERE id = $1 RETURNING id',
      values: [id],
    };

    const result = await this._pool.query(query);

    if (!result.rows.length) {
      throw new NotFoundError('Playlist gagal dihapus. Id tidak ditemukan');
    }

    const { owner } = result.rows[0];
    await this._cacheService.delete(`playlists:${owner}`);
  }

  async verifyPlaylistOwner(id, owner) {
    const query = {
      text: 'SELECT * FROM playlists WHERE id = $1',
      values: [id],
    };

    const result = await this._pool.query(query);

    if (!result.rows.length) {
      throw new NotFoundError('Playlist tidak ditemukan');
    }
    const playlist = result.rows[0];
    if (playlist.owner !== owner) {
      throw new AuthorizationError('Anda tidak berhak mengakses resource ini');
    }
  }

  async verifyPlaylistAccess(playlistId, userId) {
    try {
      await this.verifyPlaylistOwner(playlistId, userId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      try {
        await this._collaborationsService.verifyCollaborator(playlistId, userId);
      } catch {
        throw error;
      }
    }
  }

  async addSongToPlaylist(playlistId, songId) {
    const songQuery = {
      text: 'SELECT * FROM songs WHERE id = $1',
      values: [songId],
    };

    const resultSong = await this._pool.query(songQuery);

    if (!resultSong.rows.length) {
      throw new NotFoundError('Lagu gagal ditambahkan');
    }

    const id = `playlist-songs-${nanoid(16)}`;

    const query = {
      text: 'INSERT INTO playlist_songs (id, playlist_id, song_id) VALUES ($1, $2, $3)',
      values: [id, playlistId, songId],
    };

    await this._pool.query(query);
  }

  async getSongsFromPlaylist(playlistId) {
    const queryPlaylist = {
      text: `SELECT playlists.id, playlists.name, users.username FROM playlist_songs 
      INNER JOIN playlists ON playlist_songs.playlist_id = playlists.id 
      INNER JOIN users ON playlists.owner = users.id 
      WHERE playlist_id = $1 LIMIT 1`,
      values: [playlistId],
    };

    const queryUser = {
      text: `SELECT username FROM playlists 
      INNER JOIN users ON playlists.owner = users.id 
      WHERE playlists.id = $1 LIMIT 1`,
      values: [playlistId],
    };

    const querySongs = {
      text: `SELECT songs.id, songs.title, songs.performer FROM playlist_songs 
      INNER JOIN songs ON playlist_songs.song_id = songs.id 
      WHERE playlist_id = $1`,
      values: [playlistId],
    };

    const resultPlaylist = await this._pool.query(queryPlaylist);
    const resultUser = await this._pool.query(queryUser);
    const resultSongs = await this._pool.query(querySongs);

    if (!resultPlaylist.rows.length) {
      throw new NotFoundError('Playlist tidak ditemukan');
    }

    return {
      id: resultPlaylist.rows[0].id,
      name: resultPlaylist.rows[0].name,
      username: resultUser.rows[0].username,
      songs: resultSongs.rows,
    };
  }

  async deleteSongFromPlaylist(playlistId, songId) {
    const query = {
      text: 'DELETE FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2 RETURNING id',
      values: [playlistId, songId],
    };

    const deleteplaylistResult = await this._pool.query(query);
    if (deleteplaylistResult.rows.length === 0) {
      throw new InvariantError(
        'Lagu gagal dihapus dari playlist.Id lagu tidak ditemukan',
      );
    }
  }

  async addActivity(playlistId, songId, userId) {
    const songQuery = {
      text: 'SELECT title FROM songs WHERE id = $1',
      values: [songId],
    };

    const song = await this._pool.query(songQuery);
    const { title } = song.rows[0];

    const userQuery = {
      text: 'SELECT username FROM users WHERE id = $1',
      values: [userId],
    };

    const user = await this._pool.query(userQuery);
    const { username } = user.rows[0];

    const id = `playlist-activity-${nanoid(16)}`;
    const time = new Date().toISOString();

    const query = {
      text: 'INSERT INTO playlist_song_activities VALUES($1, $2, $3, $4, $5, $6)',
      values: [id, playlistId, title, username, 'add', time],
    };

    await this._pool.query(query);
  }

  async deleteActivity(playlistId, songId, userId) {
    const songQuery = {
      text: 'SELECT title FROM songs WHERE id = $1',
      values: [songId],
    };

    const song = await this._pool.query(songQuery);
    const { title } = song.rows[0];

    const userQuery = {
      text: 'SELECT username FROM users WHERE id = $1',
      values: [userId],
    };

    const user = await this._pool.query(userQuery);
    const { username } = user.rows[0];

    const id = `playlist-activity-${nanoid(16)}`;
    const time = new Date().toISOString();

    const query = {
      text: 'INSERT INTO playlist_song_activities VALUES($1, $2, $3, $4, $5, $6)',
      values: [id, playlistId, title, username, 'delete', time],
    };

    await this._pool.query(query);
  }

  async getPlaylistActivities(playlistId) {
    const query = {
      text: 'SELECT * FROM playlist_song_activities WHERE playlist_id = $1',
      values: [playlistId],
    };

    const result = await this._pool.query(query);

    if (!result.rows.length) {
      throw new NotFoundError('Tidak ada aktivitas');
    }

    const showResult = result.rows.map((row) => ({
      username: row.user_id,
      title: row.song_id,
      action: row.action,
      time: row.time,
    }));

    return {
      playlistId,
      activities: showResult,
    };
  }
}

module.exports = PlaylistsService;
