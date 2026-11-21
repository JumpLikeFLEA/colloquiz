<!-- Course import: the one repair turn (CNT-018, docs/decisions/0203 Decision 5). The user message
     is this text followed by <validation_errors>; it comes after the model's own failed answer in
     the same conversation. -->

Your last answer did not pass validation. The errors are in `<validation_errors>`, one per line.
Each names the field or block it is about.

Answer again with the whole corrected JSON object, in the same shape as before and with nothing
else: fix every listed error, and change nothing the errors do not touch. Do not shorten the
lesson or drop blocks to make an error go away; fix the block. If an error says a text is empty
or has the wrong number of cells, supply the real content from the uploaded file.
