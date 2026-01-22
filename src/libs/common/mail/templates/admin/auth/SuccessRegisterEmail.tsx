// src/libs/common/mail/templates/success-register.template.tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
  Hr,
} from '@react-email/components';
import * as React from 'react';

interface TemplateProps {
  name: string;
  loginUrl: string;
}

export const SuccessRegisterEmail = ({ name, loginUrl }: TemplateProps) => {
  return (
    <Html>
      <Head />
      <Preview>Ваш акаунт у системі ICT успішно створено</Preview>
      <Tailwind>
        <Body className="bg-gray-100 my-auto mx-auto font-sans">
          <Container className="bg-white border border-solid border-gray-200 rounded my-[40px] mx-auto p-[20px] max-w-[600px] w-full">
            <Section className="mt-[32px]">
              <Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0">
                Вітаємо, <strong>{name}</strong>!
              </Heading>
              <Text className="text-black text-[14px] leading-[24px]">
                Ваш обліковий запис було успішно створено менеджером. Тепер ви маєте доступ до системи <strong>ICT Cargo</strong>.
              </Text>

              <Section className="bg-blue-50 rounded-lg p-[20px] my-[24px]">
                <Text className="text-[16px] font-bold mb-[10px] text-blue-800">
                  Наступні кроки для входу:
                </Text>
                
                <Text className="text-[14px] leading-[22px] m-0 mb-[12px]">
                  <strong>1. Встановіть пароль:</strong> Перейдіть на сторінку входу, натисніть 
                  <Link href={`${loginUrl}/forgot-password`} className="text-blue-600 underline ml-1">
                    "Забули пароль?"
                  </Link> та створіть власний пароль для доступу.
                </Text>

                <Text className="text-[14px] leading-[22px] m-0">
                  <strong>2. Підтвердження:</strong> Після першого входу система попросить вас додатково підтвердити вашу електронну адресу для безпеки акаунта.
                </Text>
              </Section>

              <Section className="text-center mt-[32px] mb-[32px]">
                <Link
                  className="bg-[#000000] rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3 inline-block"
                  href={loginUrl}
                >
                  Перейти до системи
                </Link>
              </Section>

              <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />
              
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                Якщо ви не очікували цього листа, просто ігноруйте його. Посилання для входу: 
                <Link href={loginUrl} className="text-blue-600 no-underline ml-1">
                  {loginUrl}
                </Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};