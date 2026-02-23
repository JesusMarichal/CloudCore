import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

async function bootstrap() {
    dotenv.config();
    const app = await NestFactory.create(AppModule);

    app.enableCors(); // Habilitar CORS para React

    const port = process.env.PORT || 3000;
    await app.listen(port);

    console.log(`--- CloudCore Engine Running on port ${port} ---`);
}

bootstrap();
