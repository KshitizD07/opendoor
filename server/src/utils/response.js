/**
 * Standardized API Response Helpers (ESM)
 */

export const sendSuccess = (res, data = null, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    error: null,
  });
};

export const sendCreated = (res, data = null, message = 'Resource created successfully') => {
  return sendSuccess(res, data, message, 201);
};

export const sendPaginated = (res, items = [], pagination = {}, message = 'Data retrieved successfully') => {
  return res.status(200).json({
    success: true,
    message,
    data: {
      items,
      pagination: {
        page: pagination.page || 1,
        limit: pagination.limit || items.length,
        total: pagination.total || items.length,
        totalPages: pagination.totalPages || 1,
      },
    },
    error: null,
  });
};
