import { Html } from '@react-email/html';
import { Body, Heading, Tailwind, Text } from '@react-email/components';
import * as React from 'react';

export function SuccessfulPreRegistrationTemplate() {
  return (
    <Tailwind>
      <Html>
        <Body className="text-black">
          <Heading>Вітаємо з успішною реєстрацією!</Heading>

          <Text>
            Дякуємо, що приєдналися до нашої платформи. Ваш обліковий запис успішно створено.
          </Text>

          <Text>
            Наші менеджери вже перевіряють надану вами інформацію. У разі необхідності вони звʼяжуться з вами найближчим часом.
          </Text>

          <Text>
            Якщо ви не створювали обліковий запис — просто проігноруйте цей лист.
          </Text>

          <Text>Гарного дня!<br/>Команда підтримки</Text>
        </Body>
      </Html>
    </Tailwind>
  );
}
