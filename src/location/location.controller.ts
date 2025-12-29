import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { LocationService } from './location.service';

@Controller("location")
export class LocationController {
  constructor(private readonly service: LocationService) {}

  @Get("autocomplete")
  autocomplete(@Query("input") input: string) {
    return this.service.autocomplete(input);
  }

  @Post("resolve")
  resolve(@Body("placeId") placeId: string) {
    return this.service.resolve(placeId);
  }
}
