import { Html } from '@react-email/html';
import { Body, Heading, Link, Tailwind, Text } from '@react-email/components';
import * as React from 'react';
interface ResetPasswordTemplateProps {
  domain: string;
  token: string;
}
export function ResetPasswordTemplate({
  domain,
  token,
}: ResetPasswordTemplateProps) {
  const resetLink = `${domain}/auth/new-password?token=${token}`;

  return (
    <Tailwind>
      <Html>
        <Body className="text-black">
          <Heading>Скидання паролю</Heading>
          <Text>
            Привіт! Скидання паролю. Будь ласка перейдіть за цим посиланням щоб
            створити новий пароль
          </Text>

          <Link href={resetLink}>Підвердіть пошту</Link>
          <Text>
            Це посилання валідне 1 годину.Якщо ви не запрошували даний лист ,
            просто його проігноруйте
          </Text>
          <Text>Дякуємо!</Text>
        </Body>
      </Html>
    </Tailwind>
  );
}
