# OpenAlg

A worksheet and test generator for math teachers (Algebra 2 and Precalculus). A teacher picks a topic, tunes its options, and gets printable problems with matching answer keys.

## Language

### Content

**Course**:
A subject a teacher teaches over a year, made of Units (e.g. "Algebra 2", "Precalculus"). Every Topic belongs to one Course, through its Unit.
_Avoid_: Class, subject, book

**Unit**:
A grouping of related Topics within a Course, mirroring how the Course is taught (e.g. "Quadratics").
_Avoid_: Chapter, module

**Topic**:
One kind of problem a teacher can ask for (e.g. "Solve quadratics by factoring"), with its own Topic Options.
_Avoid_: Generator (in user-facing language), skill, problem type

**Topic Options**:
The teacher-adjustable settings of a Topic that shape the problems it produces (e.g. whether roots are rational, irrational or imaginary).
_Avoid_: Params, settings, config

**Problem**:
A single question on a Worksheet together with its correct Answer.
_Avoid_: Question, item, exercise

**Answer**:
The correct response to a Problem, known because the Problem was built backwards from it — never solved after the fact.
_Avoid_: Solution

**Distractor**:
A wrong answer offered in a multiple-choice Problem, modelled on a mistake students commonly make.
_Avoid_: Wrong option, decoy

**Response Format**:
Whether a Worksheet's Problems are answered free response or multiple choice (with 2 to 5 choices each). Set for the whole Worksheet, not per Section.
_Avoid_: Mode, question type

**Custom Problem**:
A Problem a teacher wrote by hand rather than one produced from a Topic.

### Worksheets

**Worksheet**:
A titled, ordered list of Sections with Print Settings and an Answer Key, that a teacher hands out. A test or quiz is simply a Worksheet, usually printed in Versions.
_Avoid_: Test, quiz, sheet, document, assignment

**Section**:
A run of consecutive Problems on a Worksheet that all come from one Topic and share one set of Directions. A single-Topic Worksheet has exactly one Section.
_Avoid_: Part, block, group

**Directions**:
The instruction line printed above a Section's Problems (e.g. "Solve each equation by factoring.").
_Avoid_: Instructions, prompt

**Recipe**:
Everything needed to produce a Problem or Worksheet again from scratch (Topic, Topic Options and the random choice that was made), stored alongside the finished content so it can be re-rolled.

**Re-roll**:
Replace one Problem with a fresh one from the same Recipe, leaving every other Problem untouched.
_Avoid_: Refresh, regenerate (for a single Problem)

**Regenerate**:
Replace every Problem on a Worksheet with a fresh set from the same Recipe.
_Avoid_: Re-roll (for the whole Worksheet), reset

**Answer Key**:
The printed list of a Worksheet's Answers, in one of several formats (full, odd-numbered only, in context, or none). The format is a choice on the Worksheet itself, not a Print Setting, and every Version prints its own key in that same format. An in-context key is a copy of the Worksheet with each Answer printed under its Problem (for multiple choice, the correct letter circled).
_Avoid_: Solutions, key sheet

**Version**:
One of several scrambled variants of a Worksheet, printed with its own matching Answer Key so neighbouring students can't copy. Versions are always derived from their Worksheet, never kept separately.
_Avoid_: Copy, form, variant

**Scramble Mode**:
How a Worksheet's Versions differ from one another: shuffled choices, shuffled Problem order, or entirely new Problems.

**Print Settings**:
The page layout choices a Worksheet carries (paper, orientation, margins, text size, work space, header blanks, page numbers), shared by the preview and the printout.
_Avoid_: Print config, layout options

**Preview**:
An on-screen rendering of a Worksheet that is exactly what will print.

### Keeping work

**Library**:
The teacher's collection of saved Worksheets, kept automatically without the teacher choosing where.
_Avoid_: Recents, files, documents

**Worksheet File**:
A portable `.oalg` copy of a Worksheet that a teacher can keep, send to a colleague, or open later.
_Avoid_: Export (reserved for PDF), save file

**Library Backup**:
A single downloadable file holding every Worksheet in the Library, which can be restored to rebuild the Library in any browser.
_Avoid_: Export (reserved for PDF), archive
