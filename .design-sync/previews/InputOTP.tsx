import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from 'colloquiz';

export const SixDigit = () => (
  <InputOTP maxLength={6} defaultValue="428">
    <InputOTPGroup>
      <InputOTPSlot index={0} />
      <InputOTPSlot index={1} />
      <InputOTPSlot index={2} />
    </InputOTPGroup>
    <InputOTPSeparator />
    <InputOTPGroup>
      <InputOTPSlot index={3} />
      <InputOTPSlot index={4} />
      <InputOTPSlot index={5} />
    </InputOTPGroup>
  </InputOTP>
);
