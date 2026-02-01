// shared/constants/socket-events.ts

export const SOCKET_EVENTS = {
  USER: {
    STATUS_CHANGE: 'user_status_change',
    GET_ONLINE: 'get_online_users',
    HEARTBEAT: 'heartbeat',
  },
  LOAD: {
    // Основні дії
    NEW: 'NEW_LOAD',
    UPDATE: 'UPDATE_LOAD', // загальне оновлення
    EDIT: 'EDIT_LOAD',     // редагування картки
    DELETE: 'delete_load',
    COPY: 'copy_load',     // якщо потрібно окремо
    
    // Машини
    ADD_CAR: 'LOAD_ADD_CAR',
    REMOVE_CAR: 'LOAD_REMOVE_CAR',
    CLOSE_CAR_BY_MANAGER: 'CLOSE_CAR_BY_MANAGER', // додано
    
    // Дати та коментарі
    DATE_UPDATE: 'update_load_date',
    COMMENT: 'new_load_comment',
    COMMENT_UPDATE: 'load_comment_updated',
    CHAT_COUNT_UPDATE: 'update_chat_count_load', // додано
  },
} as const;