import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption,
  Badge,
} from 'colloquiz';

export const Leaderboard = () => (
  <Table className="w-[32rem]">
    <TableCaption>Recent quiz attempts</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Quiz</TableHead>
        <TableHead>Difficulty</TableHead>
        <TableHead className="text-right">Score</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell className="font-medium">Organic Chemistry</TableCell>
        <TableCell><Badge variant="secondary">Hard</Badge></TableCell>
        <TableCell className="text-right">82%</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="font-medium">Cell Biology</TableCell>
        <TableCell><Badge variant="secondary">Medium</Badge></TableCell>
        <TableCell className="text-right">91%</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="font-medium">Thermodynamics</TableCell>
        <TableCell><Badge variant="secondary">Hard</Badge></TableCell>
        <TableCell className="text-right">67%</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
