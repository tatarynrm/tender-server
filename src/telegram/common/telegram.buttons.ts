import { Markup } from 'telegraf';

export function actionButtons() {
  return Markup.inlineKeyboard([
    Markup.button.callback('Список справ', 'list'),
    Markup.button.callback('Редагувати', 'edit'),
    Markup.button.callback('Видалити', 'delete'),
  ]);
}
