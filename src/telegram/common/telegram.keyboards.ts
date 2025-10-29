// telegram-keyboards.ts
import { Markup } from 'telegraf';

export const DEFAULT_KEYBOARD = Markup.keyboard(
  [
    Markup.button.callback('🚛 Мої перевезення', 'my_transportations'),
    Markup.button.callback('📢 Участь в тендерах', 'tender_particapate'),
    Markup.button.callback('🚛 Мої перевезення', 'my_transportations'),
  ],
  {
    columns: 3,
  },
).resize();
export const PREMIUM_KEYBOARD = Markup.keyboard([
  ['Premium Option 1', 'Premium Option 2'],
  ['Help'],
]).resize();
