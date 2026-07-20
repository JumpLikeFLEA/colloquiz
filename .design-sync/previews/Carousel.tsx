import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext,
  Card, CardContent,
} from 'colloquiz';

export const Flashcards = () => (
  <div className="px-14">
    <Carousel className="w-64">
      <CarouselContent>
      {['H₂O', 'CO₂', 'NaCl', 'CH₄'].map((f) => (
        <CarouselItem key={f}>
          <Card>
            <CardContent className="flex aspect-square items-center justify-center p-6 text-3xl font-semibold">
              {f}
            </CardContent>
          </Card>
        </CarouselItem>
      ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  </div>
);
