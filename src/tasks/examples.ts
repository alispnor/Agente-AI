export const taskUploadAvatar: string = `Feature: upload de avatar de usuário.
O usuário deve poder fazer upload de uma imagem JPG/PNG até 5MB,
visualizar preview antes de confirmar, e a imagem deve ser
redimensionada para 200x200px no servidor.`;

export const taskRateLimit: string = `Implementar rate limiting na API de autenticação:
máximo 5 tentativas de login por minuto por IP.
Após exceder, retornar HTTP 429 com header Retry-After.`;

export const taskBugSafari: string = `Bug crítico em produção: o formulário de checkout
quebra no Safari iOS 16 com modo de economia de dados ativado.
O botão de confirmar compra não responde ao toque. Afeta 12% dos usuários mobile.`;
