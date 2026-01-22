import * as React from 'react';
import { Html } from '@react-email/html';
import { Body, Heading, Tailwind, Text } from '@react-email/components';


export function SuccessfulPreRegistrationAccountTemplate() {
  return (
    <Tailwind>
      <Html>
        <Body className="text-black">
          <Heading>Вітаємо з успішною реєстрацією!</Heading>

          <Text>
            Дякуємо, що приєдналися до нашої платформи. Ваш обліковий запис
            успішно створено.
          </Text>

          <Text>Ви можете увійни в свій аккаунт!!!</Text>
        </Body>
      </Html>
    </Tailwind>
  );
}
