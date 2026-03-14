import { Body, Controller, Post } from '@nestjs/common';
import { CreateAwardDto } from '../dto/create-portfolio.dto';
import { PortfolioService } from '../services/portfolio.service';

@Controller('users/profile')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post('award')
  createAward(@Body() createAwardDto: CreateAwardDto) {
    return this.portfolioService.createAward(createAwardDto);
  }
}
