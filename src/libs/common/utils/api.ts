// /shared/api/axiosApi5.ts
import axios from "axios";

const api5 = axios.create({
  baseURL: "https://api5.ict.lviv.ua", // базова URL твого сервісу
  withCredentials: true, // якщо використовуєш куки
  headers: {
    "Content-Type": "application/json",
  },
});

// Можеш додати інтерцептори для логування, авторизації, обробки помилок
api5.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("API5 Error:", error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api5;
