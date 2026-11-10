import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Publico } from '../auth/decoradores';
import type { Config } from '../config';
import { CONFIG } from '../tokens';
import { WebhookService, verificarFirma, webhookSchema } from './webhook.service';

/**
 * Webhook de WhatsApp. Es público (Meta no usa nuestro login) pero NO es abierto: cada llamada
 * debe traer una firma HMAC válida calculada con el secreto de la app de Meta.
 */
@Controller('webhooks/whatsapp')
export class WebhookController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(WebhookService) private readonly webhook: WebhookService,
  ) {}

  /** Verificación al registrar el webhook en Meta: se devuelve `hub.challenge` si el token coincide. */
  @Get()
  @Publico()
  @Header('Content-Type', 'text/plain')
  verificar(
    @Query('hub.mode') modo?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') desafio?: string,
  ) {
    const esperado = this.config.whatsapp.verifyToken;
    if (modo === 'subscribe' && esperado && token === esperado && desafio) return desafio;
    throw new ForbiddenException('Token de verificación no válido');
  }

  @Post()
  @Publico()
  @HttpCode(200)
  async recibir(@Req() req: Request & { rawBody?: Buffer }) {
    const secreto = this.config.whatsapp.appSecret;
    // Sin secreto configurado (modo simulador) el webhook externo está deshabilitado.
    if (!verificarFirma(req.rawBody, req.header('x-hub-signature-256'), secreto)) {
      throw new UnauthorizedException('Firma no válida');
    }
    const p = webhookSchema.safeParse(req.body);
    if (!p.success) throw new BadRequestException('Cuerpo no válido');
    const r = await this.webhook.procesar(p.data);
    return { recibido: true, ...r };
  }
}
