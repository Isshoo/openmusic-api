const autoBind = require('auto-bind');
const config = require('../../utils/config');

class AlbumsHandler {
  constructor(service, storageService, validator, uploadValidator) {
    this._service = service;
    this._validator = validator;
    this._storageService = storageService;
    this._uploadValidator = uploadValidator;

    autoBind(this);
  }

  async postAlbumHandler(request, h) {
    this._validator.validateAlbumPayload(request.payload);
    const { name, year, cover = null } = request.payload;

    const albumId = await this._service.addAlbum({ name, year, cover });

    const response = h.response({
      status: 'success',
      message: 'Album berhasil ditambahkan',
      data: {
        albumId,
      },
    });
    response.code(201);
    return response;
  }

  async getAlbumByIdHandler(request) {
    const { id } = request.params;
    const album = await this._service.getAlbumById(id);
    return {
      status: 'success',
      data: {
        album,
      },
    };
  }

  async putAlbumByIdHandler(request) {
    this._validator.validateAlbumPayload(request.payload);
    const { id } = request.params;

    await this._service.editAlbumById(id, request.payload);

    return {
      status: 'success',
      message: 'Album berhasil diperbarui',
    };
  }

  async deleteAlbumByIdHandler(request) {
    const { id } = request.params;
    await this._service.deleteAlbumById(id);

    return {
      status: 'success',
      message: 'Album berhasil dihapus',
    };
  }

  async postAlbumCoverByIdHandler(request, h) {
    const { id } = request.params;
    const { cover: cover_url } = request.payload;

    this._uploadValidator.validateImageHeaders(cover_url.hapi.headers);

    const filename = await this._storageService.writeFile(cover_url, cover_url.hapi);
    const path = `http://${config.app.host}:${config.app.port}/albums/covers/${filename}`;

    await this._service.addAlbumCover(id, path);

    const response = h.response({
      status: 'success',
      message: 'Sampul berhasil diunggah',
    });
    response.code(201);
    return response;
  }

  async postAlbumLikesByIdHandler(req, h) {
    const { id } = req.params;
    const userId = req.auth.credentials.id;

    await this._service.verifyUserLiked(id, userId);
    await this._service.addLikesToAlbum(id, userId);

    const response = h.response({
      status: 'success',
      message: 'Anda menyukai album ini',
    });
    response.code(201);
    return response;
  }

  async getAlbumLikesByIdHandler(req, h) {
    const { id } = req.params;
    const likes = await this._service.getAlbumLikes(id);

    const response = h.response({
      status: 'success',
      data: {
        likes,
      },
    });

    return response;
  }

  async deleteAlbumLikesByIdHandler(req) {
    const { id } = req.params;
    const userId = req.auth.credentials.id;

    await this._service.deleteLike(id, userId);

    return {
      status: 'success',
      message: 'Berhasil membatalkan like',
    };
  }
}

module.exports = AlbumsHandler;
