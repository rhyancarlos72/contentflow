import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center">
      <EmptyState icon={<Compass className="h-6 w-6" />} title="Página não encontrada"
        description="O endereço pode ter mudado ou não existe mais."
        action={<Link to="/app"><Button>Voltar ao início</Button></Link>} />
    </div>
  );
}
